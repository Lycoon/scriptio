import { DurableObject } from "cloudflare:workers";
import * as Y from "yjs";
import { verify } from "jsonwebtoken";

import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";

export interface Env {
    SCREENPLAY_ROOM: DurableObjectNamespace;
    JWT_SECRET: string; // Need to match the env variable from production
}

function handleProtocolMessage(room: ScreenplayRoom, fullMessage: Uint8Array, sender: WebSocket) {
    const messageType = fullMessage[0];
    const messageContent = fullMessage.subarray(1);
    const decoder = decoding.createDecoder(messageContent);

    try {
        switch (messageType) {
            case 0:
                syncProtocol.readSyncMessage(decoder, new encoding.Encoder(), room.doc, room);
                room.broadcast(fullMessage, sender);
                room.scheduleSave();
                break;

            case 1:
                //awarenessProtocol.applyAwarenessUpdate(room.awareness, messageContent.subarray(1), sender);
                room.broadcast(fullMessage, sender);
                break;

            default:
                console.warn(`Unknown message type received: ${messageType}`);
                break;
        }
    } catch (e) {
        const decoder = new TextDecoder("utf-8");
        const text = decoder.decode(fullMessage);
        console.error(`YJS Protocol Error: Failed to process message type ${messageType} with message ${text}`);
        if (messageType !== 1) {
            room.broadcast(fullMessage, sender);
        }
    }
}

export class ScreenplayRoom extends DurableObject {
    doc: Y.Doc;
    sessions: Map<WebSocket, Set<number>>;
    saveTimeout: any = null;
    awareness: awarenessProtocol.Awareness;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        this.sessions = new Map();
        this.doc = new Y.Doc();
        this.awareness = new awarenessProtocol.Awareness(this.doc);

        this.awareness.on("update", ({ added, updated, removed }: any, origin: any) => {
            if (origin instanceof WebSocket) {
                const clientIds = this.sessions.get(origin) || new Set();
                added.forEach((id: number) => clientIds.add(id));
                this.sessions.set(origin, clientIds);
            }
            //broadcastAwareness(this, added, updated, removed, origin);
        });

        this.ctx.blockConcurrencyWhile(async () => {
            const storedDoc = await this.ctx.storage.get<Uint8Array>("doc");
            if (storedDoc) {
                Y.applyUpdate(this.doc, storedDoc);
            }
        });
    }

    async fetch(request: Request): Promise<Response> {
        if (request.headers.get("Upgrade") === "websocket") {
            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);

            this.ctx.acceptWebSocket(server);
            this.sessions.set(server, new Set());

            const encoder = encoding.createEncoder();
            syncProtocol.writeSyncStep1(encoder, this.doc);
            const syncStep1 = new Uint8Array([0, ...encoding.toUint8Array(encoder)]);
            server.send(syncStep1);

            return new Response(null, { status: 101, webSocket: client });
        }
        return new Response("Expected WebSocket", { status: 400 });
    }

    async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
        if (!(message instanceof ArrayBuffer)) return;

        const fullMessage = new Uint8Array(message);
        if (fullMessage.length === 0) return;

        //console.log("\nReceived webSocketMessage");
        handleProtocolMessage(this, fullMessage, ws);
    }

    scheduleSave() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
            this.saveToDisk();
        }, 3000);
    }

    async saveToDisk() {
        const fullDocState = Y.encodeStateAsUpdate(this.doc);
        await this.ctx.storage.put("doc", fullDocState);
        this.saveTimeout = null;
    }

    async webSocketClose(ws: WebSocket) {
        const clientIds = this.sessions.get(ws);
        if (clientIds) {
            awarenessProtocol.removeAwarenessStates(this.awareness, Array.from(clientIds), null);
            this.sessions.delete(ws);
        }
    }

    broadcast(message: Uint8Array, sender: WebSocket | undefined) {
        for (const client of this.sessions.keys()) {
            if (client !== sender && client.readyState === 1) {
                client.send(message);
            }
        }
    }
}

async function isValidToken(token: string, projectId: string, env: Env): Promise<boolean> {
    try {
        const decoded = verify(token, env.JWT_SECRET) as any;
        if (decoded.projectId !== projectId) return false;
        return true;
    } catch (err) {
        return false;
    }
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        const clientId = url.searchParams.get("clientId");
        const projectId = url.pathname.slice(1).replace(/\/$/, "") || "default";
        console.log("Initializing websocket session");

        if (!projectId || !clientId || !token) {
            return new Response("Missing projectId, clientId, or token", { status: 400 });
        }

        if (!(await isValidToken(token, projectId, env))) {
            return new Response("Unauthorized", { status: 401 });
        }

        console.log("Session opened for " + projectId);
        const stubId = env.SCREENPLAY_ROOM.idFromName(projectId);
        const stub = env.SCREENPLAY_ROOM.get(stubId);
        return stub.fetch(request);
    },
};
