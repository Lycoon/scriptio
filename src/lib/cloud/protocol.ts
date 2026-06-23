import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import type { ProjectRoom } from "./room";

/**
 * Yjs sync sub-message types (mirrors y-protocols/sync constants).
 * Step1 is a read-only request — the server replies with Step2.
 * Step2 and Update both carry data that mutates the doc.
 */
const SYNC_STEP_1 = 0;
const SYNC_STEP_2 = 1;
const SYNC_UPDATE = 2;

export function handleProtocolMessage(room: ProjectRoom, fullMessage: Uint8Array, sender: WebSocket) {
    const messageType = fullMessage[0];
    const messageContent = fullMessage.subarray(1);
    const decoder = decoding.createDecoder(messageContent);

    try {
        switch (messageType) {
            case 0: // Sync (document updates)
                const session = room.sessions.get(sender);
                const isReadOnly = session?.role === "VIEWER";

                const syncEncoder = encoding.createEncoder();
                encoding.writeVarUint(syncEncoder, 0); // Message type 0 (sync)

                // Handle multiple sync messages in a single packet (common in y-websocket).
                // We dispatch sub-messages manually so we can drop writes from
                // viewers while still answering their SyncStep1 read requests.
                try {
                    while (decoding.hasContent(decoder)) {
                        const subType = decoding.readVarUint(decoder);
                        if (subType === SYNC_STEP_1) {
                            // Read-only: server responds with SyncStep2 carrying the current doc state.
                            syncProtocol.readSyncStep1(decoder, syncEncoder, room.doc);
                        } else if (subType === SYNC_STEP_2 || subType === SYNC_UPDATE) {
                            // Both carry an update payload that would mutate the doc.
                            // For viewers we read the bytes off the decoder but never
                            // apply them, so the rest of the packet stays parseable.
                            if (isReadOnly) {
                                decoding.readVarUint8Array(decoder);
                                console.warn(JSON.stringify({
                                    event: "dropped_write_from_viewer",
                                    userId: session?.userId ?? "?"
                                }));
                            } else if (subType === SYNC_STEP_2) {
                                syncProtocol.readSyncStep2(decoder, room.doc, sender);
                            } else {
                                syncProtocol.readUpdate(decoder, room.doc, sender);
                            }
                        } else {
                            // Unknown sub-type — bail to avoid mis-aligning the decoder.
                            console.warn(JSON.stringify({
                                event: "unknown_sync_sub_message_type",
                                subType
                            }));
                            break;
                        }
                    }
                } catch (e) {
                    console.error(JSON.stringify({ event: "error_reading_sync_message", error: String(e) }));
                }

                // If there's a response to send (e.g., SyncStep2 in response to SyncStep1),
                // send it back to the client. This is essential for the client to know sync is complete.
                if (encoding.length(syncEncoder) > 1) {
                    sender.send(encoding.toUint8Array(syncEncoder));
                }

                room.updateSessionActivity(sender);
                break;

            case 1: // Awareness (cursor)
                const awarenessUpdate = decoding.readVarUint8Array(decoder);
                awarenessProtocol.applyAwarenessUpdate(room.awareness, awarenessUpdate, sender);
                room.broadcast(fullMessage, sender);
                room.updateSessionActivity(sender);
                break;

            case 3: // Awareness query (messageQueryAwareness) - client is requesting awareness states
                const currentStates = room.awareness.getStates();
                if (currentStates.size > 0) {
                    const respEncoder = encoding.createEncoder();
                    encoding.writeVarUint(respEncoder, 1); // awareness message type
                    encoding.writeVarUint8Array(
                        respEncoder,
                        awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(currentStates.keys())),
                    );
                    sender.send(encoding.toUint8Array(respEncoder));
                }
                room.updateSessionActivity(sender);
                break;

            case 9: // Ping - respond immediately
                sender.send(fullMessage);
                room.updateSessionActivity(sender);
                break;

            default:
                console.warn(JSON.stringify({ event: "unknown_message_type", messageType }));
                break;
        }
    } catch (e) {
        console.error(JSON.stringify({
            event: "protocol_error",
            messageType,
            error: String(e)
        }));
        // For non-awareness messages, still try to broadcast (might be important)
        if (messageType !== 1) {
            room.broadcast(fullMessage, sender);
        }
    }
}
