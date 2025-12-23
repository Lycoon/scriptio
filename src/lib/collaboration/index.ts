/// <reference types="@cloudflare/workers-types" />
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
            case 0: // Sync (document updates)
                syncProtocol.readSyncMessage(decoder, new encoding.Encoder(), room.doc, room);
                room.broadcast(fullMessage, sender);
                room.scheduleSave();
                break;
            case 1: // Awareness (cursor)
                room.broadcast(fullMessage, sender);
                break;
            case 9: // Ping
                sender.send(fullMessage);
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
    saveTimeout: any = null;
    awareness: awarenessProtocol.Awareness;
    sessions: Map<WebSocket, Set<number>>;
    userConnections: Map<string, WebSocket>;
    blacklist: Set<string>;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        this.doc = new Y.Doc();
        this.awareness = new awarenessProtocol.Awareness(this.doc);
        this.sessions = new Map();
        this.userConnections = new Map();
        this.blacklist = new Set();

        this.awareness.on("update", ({ added, updated, removed }: any, origin: any) => {
            if (origin instanceof WebSocket) {
                const clientIds = this.sessions.get(origin) || new Set();
                added.forEach((id: number) => clientIds.add(id));
                this.sessions.set(origin, clientIds);
            }
        });

        this.ctx.blockConcurrencyWhile(async () => {
            // Restoring project document
            const storedDoc = await this.ctx.storage.get<Uint8Array>("doc");
            if (storedDoc) Y.applyUpdate(this.doc, storedDoc);

            // Restoring blacklist
            const storedBlacklist = await this.ctx.storage.get<string[]>("blacklist");
            if (storedBlacklist) this.blacklist = new Set(storedBlacklist);
        });
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        // When a user is kicked from a project, its JWT cloud token is most likely still valid
        // We want to block him at the websocket level by blacklisting its user id (until it is reinvited again)
        if (request.method === "POST" && url.pathname === "/blacklist") {
            const { userId } = (await request.json()) as any;
            if (userId) {
                this.blacklist.add(userId);

                const socket = this.userConnections.get(userId);
                if (socket) {
                    socket.close(4003, "You have been removed from this project.");
                    this.userConnections.delete(userId);
                }

                console.log(`Blacklisted user ${userId} from project`);
                await this.ctx.storage.put("blacklist", Array.from(this.blacklist));
                return new Response(`User ${userId} blacklisted.`, { status: 200 });
            }
            return new Response("Missing userId", { status: 400 });
        }

        // If a blacklisted user gets reinvited after being kicked, we need to remove it from blacklist
        if (request.method === "POST" && url.pathname === "/allow") {
            const { userId } = (await request.json()) as any;
            if (userId) {
                const wasBlacklisted = this.blacklist.delete(userId);
                if (wasBlacklisted) {
                    await this.ctx.storage.put("blacklist", Array.from(this.blacklist));
                }
                console.log(`Allowed user ${userId} to project`);
                return new Response(`User ${userId} allowed.`, { status: 200 });
            }
            return new Response("Missing userId", { status: 400 });
        }

        // First handshake with the worker. The connection is kept alive thanks to ping requests
        if (request.headers.get("Upgrade") === "websocket") {
            const userId = request.headers.get("X-User-Id");
            if (!userId) return new Response("Missing User Identity", { status: 400 });

            if (this.blacklist.has(userId)) {
                return new Response("Unauthorized: You have been kicked.", { status: 403 });
            }

            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);

            this.ctx.acceptWebSocket(server);
            this.sessions.set(server, new Set());

            const encoder = encoding.createEncoder();
            syncProtocol.writeSyncStep1(encoder, this.doc);

            const payload = encoding.toUint8Array(encoder);
            const syncStep1 = new Uint8Array(payload.length + 1);
            syncStep1.set([0], 0);
            syncStep1.set(payload, 1);
            server.send(syncStep1);

            return new Response(null, { status: 101, webSocket: client });
        }
        return new Response("Expected WebSocket", { status: 400 });
    }

    async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
        if (!(message instanceof ArrayBuffer)) return;

        const fullMessage = new Uint8Array(message);
        if (fullMessage.length === 0) return;

        console.log("Received " + fullMessage.length + " bytes message update");
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

async function getVerifiedPayload(token: string | null, secret: string) {
    if (!token) return null;
    try {
        return verify(token, secret) as any;
    } catch (e) {
        return null;
    }
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const projectId = url.pathname.slice(1).replace(/\/$/, "") || "default";

        if (request.method === "POST" && url.pathname.endsWith("/blacklist")) {
            const authHeader = request.headers.get("Authorization");
            const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

            const decoded = await getVerifiedPayload(token, env.JWT_SECRET);
            if (!decoded || decoded.type !== "admin-action" || (decoded.projectId && decoded.projectId !== projectId)) {
                return new Response("Unauthorized", { status: 401 });
            }

            const stub = env.SCREENPLAY_ROOM.get(env.SCREENPLAY_ROOM.idFromName(projectId));
            return stub.fetch(request);
        }

        if (request.headers.get("Upgrade") === "websocket") {
            const token = url.searchParams.get("token");
            const decoded = await getVerifiedPayload(token, env.JWT_SECRET);

            if (!decoded || decoded.projectId !== projectId) {
                return new Response("Unauthorized", { status: 401 });
            }

            const userId = decoded.userId || decoded.sub;
            const newRequest = new Request(request);
            newRequest.headers.set("X-User-Id", userId);

            const stub = env.SCREENPLAY_ROOM.get(env.SCREENPLAY_ROOM.idFromName(projectId));
            return stub.fetch(newRequest);
        }

        return new Response("Not Found", { status: 404 });
    },
};
