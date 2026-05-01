import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import type { ProjectRoom } from "./room";

export function handleProtocolMessage(room: ProjectRoom, fullMessage: Uint8Array, sender: WebSocket) {
    const messageType = fullMessage[0];
    const messageContent = fullMessage.subarray(1);
    const decoder = decoding.createDecoder(messageContent);

    try {
        switch (messageType) {
            case 0: // Sync (document updates)
                const syncEncoder = encoding.createEncoder();
                encoding.writeVarUint(syncEncoder, 0); // Message type 0 (sync)

                // Handle multiple sync messages in a single packet (common in y-websocket)
                try {
                    while (decoding.hasContent(decoder)) {
                        // Passing 'sender' (WebSocket) as origin causes the doc.on('update')
                        // listener (set up in constructor) to broadcast the change,
                        // schedule a hot save, and flag for cold snapshot.
                        syncProtocol.readSyncMessage(decoder, syncEncoder, room.doc, sender);
                    }
                } catch (e) {
                    console.error("[Room] Error reading sync message:", e);
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
                console.warn(`[Room] Unknown message type: ${messageType}`);
                break;
        }
    } catch (e) {
        console.error(`[Room] Protocol error for message type ${messageType}:`, e);
        // For non-awareness messages, still try to broadcast (might be important)
        if (messageType !== 1) {
            room.broadcast(fullMessage, sender);
        }
    }
}
