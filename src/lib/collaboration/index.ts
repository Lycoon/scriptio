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
                console.log("Received sync");
                break;
            case 1: // Awareness (cursor)
                const awarenessUpdate = decoding.readVarUint8Array(decoder);
                awarenessProtocol.applyAwarenessUpdate(room.awareness, awarenessUpdate, sender);
                room.broadcast(fullMessage, sender);
                console.log("Received awareness");
                break;
            case 9: // Ping
                sender.send(fullMessage);
                console.log("Received ping");
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

        this.ctx.storage.sql.exec(`
            CREATE TABLE IF NOT EXISTS project (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                data BLOB
            );
            CREATE TABLE IF NOT EXISTS blacklist (
                user_id TEXT PRIMARY KEY
            );
        `);

        // Restore latest project state
        const cursor = this.ctx.storage.sql.exec("SELECT data FROM project WHERE id = 1;");
        for (const row of cursor) {
            if (row.data) Y.applyUpdate(this.doc, new Uint8Array(row.data as ArrayBuffer));
        }

        // Restore blacklist
        const blacklist = this.ctx.storage.sql.exec("SELECT user_id FROM blacklist;").toArray();
        for (const row of blacklist) {
            this.blacklist.add(row.user_id as string);
        }
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
                this.ctx.storage.sql.exec(
                    "INSERT OR IGNORE INTO blacklist (user_id) VALUES (?);",
                    userId
                );
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
                    this.ctx.storage.sql.exec(
                        "DELETE FROM blacklist WHERE user_id = ?;",
                        userId
                    );
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

            // Send current project state to new user
            const encoder = encoding.createEncoder();
            syncProtocol.writeSyncStep1(encoder, this.doc);

            const payload = encoding.toUint8Array(encoder);
            const syncStep1 = new Uint8Array(payload.length + 1);
            syncStep1.set([0], 0);
            syncStep1.set(payload, 1);
            server.send(syncStep1);

            // Send current awareness state to new user
            const awarenessStates = this.awareness.getStates();
            if (awarenessStates.size > 0) {
                const awarenessEncoder = encoding.createEncoder();
                const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(
                    this.awareness,
                    Array.from(awarenessStates.keys())
                );
                encoding.writeVarUint(awarenessEncoder, 1);
                encoding.writeVarUint8Array(awarenessEncoder, awarenessUpdate);
                server.send(encoding.toUint8Array(awarenessEncoder));
            }

            return new Response(null, { status: 101, webSocket: client });
        }
        return new Response("Expected WebSocket", { status: 400 });
    }

    async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
        if (!(message instanceof ArrayBuffer)) return;

        const fullMessage = new Uint8Array(message);
        if (fullMessage.length === 0) return;

        //console.log("Received " + fullMessage.length + " bytes message update");
        handleProtocolMessage(this, fullMessage, ws);
    }

    scheduleSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveToDisk(), 2000);
    }

    async saveToDisk() {
        const fullDocState = Y.encodeStateAsUpdate(this.doc);
        this.ctx.storage.sql.exec(
            "INSERT OR REPLACE INTO project (id, data) VALUES (1, ?);",
            fullDocState
        );
        this.saveTimeout = null;
    }

    async webSocketClose(ws: WebSocket) {
        const clientIds = this.sessions.get(ws);
        if (clientIds && clientIds.size > 0) {
            const clientIdsArray = Array.from(clientIds);

            // Remove awareness states locally
            awarenessProtocol.removeAwarenessStates(this.awareness, clientIdsArray, null);

            // Broadcast awareness removal to remaining clients
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 1);
            encoding.writeVarUint8Array(
                encoder,
                awarenessProtocol.encodeAwarenessUpdate(this.awareness, clientIdsArray)
            );
            this.broadcast(encoding.toUint8Array(encoder), ws);

            console.log(`User disconnected, removed awareness for clients: ${clientIdsArray.join(", ")}`);
        }
        this.sessions.delete(ws);
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
