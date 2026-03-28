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
    JWT_SECRET: string;
}

// Configuration
const SAVE_DEBOUNCE_MS = 2000;
const STALE_AWARENESS_TIMEOUT_MS = 60000; // 60 seconds
const AWARENESS_CLEANUP_INTERVAL_MS = 30000; // Check every 30 seconds

interface SessionInfo {
    clientIds: Set<number>;
    userId: string;
    lastActivity: number;
}

function handleProtocolMessage(room: ScreenplayRoom, fullMessage: Uint8Array, sender: WebSocket) {
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
                        // listener (set up in constructor) to broadcast the change to all 
                        // other clients while excluding the sender.
                        const type = syncProtocol.readSyncMessage(decoder, syncEncoder, room.doc, sender);
                        if (type === syncProtocol.messageYjsSyncStep2 || type === syncProtocol.messageYjsUpdate) {
                            room.scheduleSave();
                        }
                    }
                } catch (e) {
                    console.error("[Room] Error reading sync message:", e);
                }

                // If there's a response to send (e.g., SyncStep2 in response to SyncStep1),
                // send it back to the client. This is essential for the client to know sync is complete.
                if (encoding.length(syncEncoder) > 1) {
                    sender.send(encoding.toUint8Array(syncEncoder));
                }

                // room.broadcast(fullMessage, sender) is no longer needed here because 
                // the doc.on('update') handler now performs granular broadcasting.
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
                        awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(currentStates.keys()))
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

export class ScreenplayRoom extends DurableObject {
    doc: Y.Doc;
    saveTimeout: ReturnType<typeof setTimeout> | null = null;
    awareness: awarenessProtocol.Awareness;
    sessions: Map<WebSocket, SessionInfo>;
    userConnections: Map<string, WebSocket>;
    blacklist: Set<string>;
    cleanupInterval: ReturnType<typeof setInterval> | null = null;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        this.doc = new Y.Doc();
        this.awareness = new awarenessProtocol.Awareness(this.doc);

        // Disable the built-in 30s outdated-state cleanup — we manage session
        // lifecycle ourselves via cleanupStaleAwareness (60s timeout).
        clearInterval((this.awareness as any)._checkInterval);
        this.awareness.setLocalState(null);

        this.sessions = new Map();
        this.userConnections = new Map();
        this.blacklist = new Set();

        // Listen for document updates and broadcast to all OTHER clients.
        // This is more robust than manual broadcasting because it handles
        // updates merged/generated by Yjs itself.
        this.doc.on("update", (update, origin) => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 0); // messageSync
            syncProtocol.writeUpdate(encoder, update);
            const message = encoding.toUint8Array(encoder);
            // Broadcast to everyone except the origin (if origin is a WebSocket)
            this.broadcast(message, origin instanceof WebSocket ? origin : undefined);
        });

        // Track client IDs when awareness updates come from a WebSocket
        this.awareness.on("update", ({ added, updated, removed }: any, origin: any) => {
            if (origin instanceof WebSocket) {
                const session = this.sessions.get(origin);
                if (session) {
                    added.forEach((id: number) => session.clientIds.add(id));
                    session.lastActivity = Date.now();
                }
            }
        });

        // Initialize database
        this.ctx.storage.sql.exec(`
            CREATE TABLE IF NOT EXISTS project (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                data BLOB
            );
            CREATE TABLE IF NOT EXISTS blacklist (
                user_id TEXT PRIMARY KEY
            );
        `);

        // Restore project state
        const cursor = this.ctx.storage.sql.exec("SELECT data FROM project WHERE id = 1;");
        for (const row of cursor) {
            if (row.data) {
                Y.applyUpdate(this.doc, new Uint8Array(row.data as ArrayBuffer));
            }
        }

        // Restore blacklist
        const blacklistRows = this.ctx.storage.sql.exec("SELECT user_id FROM blacklist;").toArray();
        for (const row of blacklistRows) {
            this.blacklist.add(row.user_id as string);
        }

        // Start periodic stale awareness cleanup
        this.startAwarenessCleanup();

        console.log("[Room] Initialized");
    }

    /**
     * Start periodic cleanup of stale awareness states
     */
    private startAwarenessCleanup(): void {
        this.cleanupInterval = setInterval(() => {
            this.cleanupStaleAwareness();
        }, AWARENESS_CLEANUP_INTERVAL_MS);
    }

    /**
     * Clean up awareness states from clients that haven't been active
     */
    private cleanupStaleAwareness(): void {
        const now = Date.now();
        const staleClientIds: number[] = [];
        const staleSockets: WebSocket[] = [];

        this.sessions.forEach((session, socket) => {
            const timeSinceActivity = now - session.lastActivity;

            if (timeSinceActivity > STALE_AWARENESS_TIMEOUT_MS) {
                console.log(
                    `[Room] Session for user ${session.userId} is stale (${timeSinceActivity}ms since activity)`
                );
                staleClientIds.push(...session.clientIds);
                staleSockets.push(socket);
            }
        });

        if (staleClientIds.length > 0) {
            // Step 1: Remove stale sessions from both maps FIRST so that:
            //   a) The subsequent broadcast only reaches genuinely active clients.
            //   b) When socket.close() triggers webSocketClose(), sessions.get(ws)
            //      returns undefined and the handler becomes a safe no-op — no
            //      double-removal of awareness states or duplicate broadcasts.
            for (const socket of staleSockets) {
                const session = this.sessions.get(socket);
                if (session) {
                    // Only delete from userConnections if this is the active entry
                    if (this.userConnections.get(session.userId) === socket) {
                        this.userConnections.delete(session.userId);
                    }
                }
                this.sessions.delete(socket);
            }

            // Step 2: Remove stale awareness states from the server-side doc.
            awarenessProtocol.removeAwarenessStates(this.awareness, staleClientIds, null);

            // Step 3: Broadcast removal only to remaining active clients
            // (stale sockets are already gone from this.sessions, so broadcast
            //  won't try to send to them).
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 1);
            encoding.writeVarUint8Array(
                encoder,
                awarenessProtocol.encodeAwarenessUpdate(this.awareness, staleClientIds)
            );
            this.broadcast(encoding.toUint8Array(encoder), undefined);

            // Step 4: Close the stale sockets last — webSocketClose will find
            // no session entry and exit immediately.
            for (const socket of staleSockets) {
                try {
                    if (socket.readyState === 1) {
                        socket.close(4000, "Connection stale");
                    }
                } catch (e) {
                    // Socket might already be closed
                }
            }

            console.log(`[Room] Cleaned up ${staleClientIds.length} stale awareness states`);
        }
    }

    /**
     * Update the last activity time for a session
     */
    updateSessionActivity(socket: WebSocket): void {
        const session = this.sessions.get(socket);
        if (session) {
            session.lastActivity = Date.now();
        }
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        // Blacklist endpoint - kick user from project
        if (request.method === "POST" && url.pathname === "/blacklist") {
            const { userId } = (await request.json()) as { userId?: string };
            if (!userId) {
                return new Response("Missing userId", { status: 400 });
            }

            this.blacklist.add(userId);

            // Close existing connection for this user
            const socket = this.userConnections.get(userId);
            if (socket) {
                // Clean up awareness before closing
                const session = this.sessions.get(socket);
                if (session && session.clientIds.size > 0) {
                    const clientIds = Array.from(session.clientIds);
                    awarenessProtocol.removeAwarenessStates(this.awareness, clientIds, null);
                    this.broadcastAwarenessRemoval(clientIds, socket);
                }

                socket.close(4003, "You have been removed from this project.");
                if (this.userConnections.get(userId) === socket) {
                    this.userConnections.delete(userId);
                }
                this.sessions.delete(socket);
            }

            this.ctx.storage.sql.exec("INSERT OR IGNORE INTO blacklist (user_id) VALUES (?);", userId);

            console.log(`[Room] Blacklisted user ${userId}`);
            return new Response(`User ${userId} blacklisted.`, { status: 200 });
        }

        // Allow endpoint - remove user from blacklist
        if (request.method === "POST" && url.pathname === "/allow") {
            const { userId } = (await request.json()) as { userId?: string };
            if (!userId) {
                return new Response("Missing userId", { status: 400 });
            }

            const wasBlacklisted = this.blacklist.delete(userId);
            if (wasBlacklisted) {
                this.ctx.storage.sql.exec("DELETE FROM blacklist WHERE user_id = ?;", userId);
            }

            console.log(`[Room] Allowed user ${userId}`);
            return new Response(`User ${userId} allowed.`, { status: 200 });
        }

        // WebSocket upgrade
        if (request.headers.get("Upgrade") === "websocket") {
            const userId = request.headers.get("X-User-Id");
            if (!userId) {
                return new Response("Missing User Identity", { status: 400 });
            }

            if (this.blacklist.has(userId)) {
                return new Response("Unauthorized: You have been kicked.", { status: 403 });
            }

            // Clean up any existing connection for this user (e.g., stale tab).
            // This ensures awareness states don't duplicate for the same user.
            const existingSocket = this.userConnections.get(userId);
            if (existingSocket) {
                const existingSession = this.sessions.get(existingSocket);
                if (existingSession && existingSession.clientIds.size > 0) {
                    const clientIds = Array.from(existingSession.clientIds);
                    awarenessProtocol.removeAwarenessStates(this.awareness, clientIds, null);
                    this.broadcastAwarenessRemoval(clientIds, existingSocket);
                }
                this.sessions.delete(existingSocket);
                try {
                    if (existingSocket.readyState === 1) {
                        existingSocket.close(4001, "Session replaced by new connection");
                    }
                } catch (e) {
                    // Socket might already be closed
                }
            }

            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);

            this.ctx.acceptWebSocket(server);

            // Initialize session
            this.sessions.set(server, {
                clientIds: new Set(),
                userId,
                lastActivity: Date.now(),
            });
            this.userConnections.set(userId, server);

            // Send current document state (sync step 1) using the same encoder
            // pattern as all other outgoing messages — avoids fragile manual byte prepend.
            const syncEncoder = encoding.createEncoder();
            encoding.writeVarUint(syncEncoder, 0); // message type: sync
            syncProtocol.writeSyncStep1(syncEncoder, this.doc);
            server.send(encoding.toUint8Array(syncEncoder));

            // Send current awareness states to the new client
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

            console.log(`[Room] User ${userId} connected. Total sessions: ${this.sessions.size}`);

            // Request all existing clients to re-broadcast their awareness
            // This ensures the new client receives everyone's current state,
            // especially important after a DurableObject restart where
            // the server's awareness cache may be empty or stale
            if (this.sessions.size > 1) {
                this.broadcastAwarenessRequest(server);
            }
            return new Response(null, { status: 101, webSocket: client });
        }

        return new Response("Expected WebSocket", { status: 400 });
    }

    async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
        if (!(message instanceof ArrayBuffer)) return;

        const fullMessage = new Uint8Array(message);
        if (fullMessage.length === 0) return;

        handleProtocolMessage(this, fullMessage, ws);
    }

    scheduleSave(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => this.saveToDisk(), SAVE_DEBOUNCE_MS);
    }

    async saveToDisk(): Promise<void> {
        try {
            const fullDocState = Y.encodeStateAsUpdate(this.doc);
            this.ctx.storage.sql.exec("INSERT OR REPLACE INTO project (id, data) VALUES (1, ?);", fullDocState);
            this.saveTimeout = null;
            console.log("[Room] Document saved to disk");
        } catch (e) {
            console.error("[Room] Failed to save document:", e);
        }
    }

    async webSocketClose(ws: WebSocket): Promise<void> {
        const session = this.sessions.get(ws);

        if (session) {
            console.log(`[Room] User ${session.userId} disconnected`);

            if (session.clientIds.size > 0) {
                const clientIds = Array.from(session.clientIds);

                // Remove awareness states
                awarenessProtocol.removeAwarenessStates(this.awareness, clientIds, null);

                // Broadcast removal to remaining clients
                this.broadcastAwarenessRemoval(clientIds, ws);

                console.log(`[Room] Removed awareness for clients: ${clientIds.join(", ")}`);
            }

            // Only delete from userConnections if this is the active entry
            if (this.userConnections.get(session.userId) === ws) {
                this.userConnections.delete(session.userId);
            }
        }

        this.sessions.delete(ws);
        console.log(`[Room] Remaining sessions: ${this.sessions.size}`);
    }

    async webSocketError(ws: WebSocket, error: any): Promise<void> {
        console.error("[Room] WebSocket error:", error);
        // The close handler will clean up
    }

    /**
     * Broadcast awareness removal for specific client IDs
     */
    private broadcastAwarenessRemoval(clientIds: number[], excludeSocket?: WebSocket): void {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 1);
        encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, clientIds));
        this.broadcast(encoding.toUint8Array(encoder), excludeSocket);
    }

    /**
     * Request all existing clients to re-broadcast their awareness state.
     * This is used when a new client connects to ensure they receive
     * everyone's current awareness state.
     */
    private broadcastAwarenessRequest(excludeSocket?: WebSocket): void {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 3); // Message type 3: messageQueryAwareness
        this.broadcast(encoding.toUint8Array(encoder), excludeSocket);
        console.log("[Room] Sent awareness request to existing clients");
    }

    /**
     * Broadcast a message to all connected clients except the sender
     */
    broadcast(message: Uint8Array, sender: WebSocket | undefined): void {
        for (const [client, session] of this.sessions) {
            if (client !== sender && client.readyState === 1) {
                try {
                    client.send(message);
                } catch (e) {
                    console.error(`[Room] Failed to send to client ${session.userId}:`, e);
                }
            }
        }
    }

    /**
     * Get the number of active connections
     */
    getConnectionCount(): number {
        return this.sessions.size;
    }

    /**
     * Get list of connected user IDs
     */
    getConnectedUsers(): string[] {
        return Array.from(this.userConnections.keys());
    }
}

async function getVerifiedPayload(token: string | null, secret: string): Promise<any | null> {
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

        // Extract project ID from path (handle trailing slashes and nested paths)
        const pathParts = url.pathname.split("/").filter((p) => p && p !== "blacklist" && p !== "allow");
        const projectId = pathParts[0] || "default";

        // Blacklist/Allow endpoints
        if (request.method === "POST" && (url.pathname.endsWith("/blacklist") || url.pathname.endsWith("/allow"))) {
            const authHeader = request.headers.get("Authorization");
            const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

            const decoded = await getVerifiedPayload(token, env.JWT_SECRET);
            if (!decoded || decoded.type !== "admin-action") {
                return new Response("Unauthorized", { status: 401 });
            }

            if (decoded.projectId && decoded.projectId !== projectId) {
                return new Response("Unauthorized: Project mismatch", { status: 401 });
            }

            const stub = env.SCREENPLAY_ROOM.get(env.SCREENPLAY_ROOM.idFromName(projectId));
            return stub.fetch(request);
        }

        // WebSocket upgrade
        if (request.headers.get("Upgrade") === "websocket") {
            const token = url.searchParams.get("token");
            const decoded = await getVerifiedPayload(token, env.JWT_SECRET);

            if (!decoded || decoded.projectId !== projectId) {
                return new Response("Unauthorized", { status: 401 });
            }

            const userId = decoded.userId || decoded.sub;
            if (!userId) {
                return new Response("Invalid token: missing user ID", { status: 401 });
            }

            const newRequest = new Request(request);
            newRequest.headers.set("X-User-Id", userId);

            const stub = env.SCREENPLAY_ROOM.get(env.SCREENPLAY_ROOM.idFromName(projectId));
            return stub.fetch(newRequest);
        }

        return new Response("Not Found", { status: 404 });
    },
};
