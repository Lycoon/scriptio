import { DurableObject } from "cloudflare:workers";
import { SignJWT } from "jose";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import {
    Env,
    SAVE_DEBOUNCE_MS,
    SNAPSHOT_INTERVAL_MS,
    STALE_AWARENESS_TIMEOUT_MS,
    AWARENESS_CLEANUP_INTERVAL_MS,
    RETENTION_30_DAYS_MS,
    RETENTION_DAY_MS,
    RETENTION_HOUR_MS,
    RETENTION_INTERVAL_30MIN_MS,
    PURGE_TOMBSTONE_GRACE_MS,
    SessionInfo,
    SaveEntry,
} from "./types";
import { handleProtocolMessage } from "./protocol";
import { ProjectState } from "../project/project-doc";
import { collectReferencedHashes } from "../assets/asset-refs";
import { migrateProjectDocCore, readProjectDocVersion } from "../project/migrations/project-migration-runner";
import { CURRENT_PROJECT_VERSION } from "../project/migrations/project-migrations";

export class ProjectRoom extends DurableObject {
    doc: ProjectState;
    saveTimeout: ReturnType<typeof setTimeout> | null = null;
    awareness: awarenessProtocol.Awareness;
    sessions: Map<WebSocket, SessionInfo>;
    userConnections: Map<string, WebSocket>;
    blacklist: Set<string>;

    private isDirty: boolean = false;
    private alarmScheduled: boolean = false;
    private projectId: string | null = null;
    private lastAwarenessCleanup: number = 0;

    /**
     * When this room was purged, or null while it is live. A purged room is a
     * tombstone: it keeps its name alive only to refuse the connections that
     * outlive the project, and does nothing else until it self-destructs.
     */
    private purgedAt: number | null = null;

    /** Project schema version of the in-memory doc; the gatekeeper compares
     *  client-advertised versions against this on connect. */
    private docVersion: number = CURRENT_PROJECT_VERSION;

    /** Set if server-side migration threw; we refuse new connections until
     *  the project is fixed manually (preserves data integrity). */
    private docMigrationFailed: boolean = false;

    // Typed references to bound handlers — initialized in the constructor body
    // so they're guaranteed to exist before being passed to doc.on/doc.off.
    // (esbuild does not guarantee class-field arrow functions are initialized
    // before the constructor body runs.)
    private handleDocUpdate!: (update: Uint8Array, origin: unknown) => void;
    private handleAwarenessUpdate!: (
        changes: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
    ) => void;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);

        // Initialize handlers at the very top of the constructor so they are
        // definitely assigned before being passed to doc.on / awareness.on.
        this.handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 0); // messageSync
            syncProtocol.writeUpdate(encoder, update);
            const message = encoding.toUint8Array(encoder);
            this.broadcast(message, origin instanceof WebSocket ? origin : undefined);
            this.scheduleSave();
            this.markDirty();
        };

        this.handleAwarenessUpdate = (
            { added, updated }: { added: number[]; updated: number[]; removed: number[] },
            origin: unknown,
        ): void => {
            if (origin instanceof WebSocket) {
                const session = this.sessions.get(origin);
                if (session) {
                    let changed = false;
                    const toAdd = [...added, ...updated];
                    toAdd.forEach((id: number) => {
                        if (!session.clientIds.has(id)) {
                            session.clientIds.add(id);
                            changed = true;
                        }
                    });
                    session.lastActivity = Date.now();
                    // Persist updated clientIds so they survive DO hibernation.
                    if (changed) this.persistSessionAttachment(origin);
                }
            }
        };

        this.doc = new ProjectState();
        this.awareness = new awarenessProtocol.Awareness(this.doc);

        // Disable the built-in 30s outdated-state cleanup — we manage session
        // lifecycle ourselves via cleanupStaleAwareness (60s timeout).
        clearInterval((this.awareness as unknown as { _checkInterval: ReturnType<typeof setInterval> })._checkInterval);
        this.awareness.setLocalState(null);

        this.sessions = new Map();
        this.userConnections = new Map();
        this.blacklist = new Set();

        // Track client IDs when awareness updates come from a WebSocket
        this.awareness.on("update", this.handleAwarenessUpdate);

        // Read the tombstone before anything else touches storage. A purged
        // room must not recreate its schema: `CREATE TABLE IF NOT EXISTS` is a
        // write, and a Durable Object that holds storage never goes away — so
        // rebuilding it on every wake-up would keep the room alive forever and
        // defeat the self-destruct alarm. Everything below is skipped: the room
        // has no doc, no sessions and no work to do, only connections to refuse.
        this.purgedAt = this.readTombstone();
        if (this.purgedAt !== null) {
            console.log(JSON.stringify({ event: "room_tombstone_loaded", purgedAt: this.purgedAt }));
            return;
        }

        // Initialize database
        this.ensureSchema();

        // Restore project state from SQLite. Attach the update handler AFTER
        // the restore so that re-loading persisted bytes on every DO wake-up
        // doesn't trigger scheduleSave / markDirty (which would save identical
        // bytes and schedule an unnecessary R2 snapshot).
        const cursor = this.ctx.storage.sql.exec("SELECT data FROM project WHERE id = 1;");
        for (const row of cursor) {
            if (row.data) {
                Y.applyUpdate(this.doc, new Uint8Array(row.data as ArrayBuffer));
            }
        }

        // Listen for document updates and handle broadcasting + persistence.
        // Attached here (after restore) so only live writes from WS clients
        // and server-side migrations trigger the save pipeline.
        this.doc.on("update", this.handleDocUpdate);

        // Restore blacklist
        const blacklistRows = this.ctx.storage.sql.exec("SELECT user_id FROM blacklist;").toArray();
        for (const row of blacklistRows) {
            this.blacklist.add(row.user_id as string);
        }

        // Restore projectId
        const configRows = this.ctx.storage.sql.exec("SELECT value FROM config WHERE key = 'projectId';").toArray();
        if (configRows.length > 0) {
            this.projectId = configRows[0].value as string;
        }

        // Server-side migration gatekeeper: bring the doc up to
        // CURRENT_PROJECT_VERSION before any client is allowed to connect.
        // blockConcurrencyWhile makes incoming requests wait for completion.
        this.ctx.blockConcurrencyWhile(async () => {
            await this.runDocMigration();
            this.observeDocVersion();
        });

        // Restore sessions from hibernated WebSockets. Cloudflare DOs can
        // hibernate to save memory while WebSockets stay connected; on the
        // next message the constructor runs again with empty maps. Without
        // this restoration, incoming messages have no session to attach to,
        // session activity tracking breaks, webSocketClose finds nothing to
        // clean up, and broadcastAwarenessRequest counts wrongly.
        const hibernatedSockets = this.ctx.getWebSockets();
        for (const ws of hibernatedSockets) {
            const attachment = ws.deserializeAttachment() as
                | { userId: string; role?: string; clientIds: number[] }
                | null;
            if (!attachment) continue;
            this.sessions.set(ws, {
                clientIds: new Set(attachment.clientIds),
                userId: attachment.userId,
                // Older attachments may not have a role; default to VIEWER
                // (read-only) to fail safe — the client will reconnect with a
                // fresh JWT carrying the correct role on the next message.
                role: attachment.role || "VIEWER",
                lastActivity: Date.now(),
            });
            this.userConnections.set(attachment.userId, ws);
        }
        if (hibernatedSockets.length > 0) {
            console.log(JSON.stringify({ event: "room_restore", hibernatedSockets: hibernatedSockets.length, restoredSessions: this.sessions.size }));
            // Awareness state was lost when the DO hibernated. Ask all
            // restored clients to re-broadcast their awareness so we can
            // rebuild room.awareness from scratch.
            this.broadcastAwarenessRequest();
        }

        console.log(JSON.stringify({ event: "room_initialized" }));
    }

    /**
     * The purge timestamp if this room has been torn down, null otherwise.
     *
     * Reads without creating anything: a missing `config` table just means the
     * room has never been opened, and the tombstoned case must leave storage
     * exactly as the purge left it so the self-destruct alarm can empty it.
     */
    private readTombstone(): number | null {
        try {
            const rows = this.ctx.storage.sql.exec("SELECT value FROM config WHERE key = 'purgedAt';").toArray();
            if (rows.length === 0) return null;
            const purgedAt = Number(rows[0].value);
            return Number.isFinite(purgedAt) ? purgedAt : null;
        } catch {
            // No `config` table — a room that was never initialized.
            return null;
        }
    }

    /**
     * Create the SQLite schema. Idempotent — run on every construction of a
     * live room, so a fresh Durable Object is usable rather than throwing on
     * the next statement. Never run on a tombstoned room.
     */
    private ensureSchema(): void {
        this.ctx.storage.sql.exec(`
            CREATE TABLE IF NOT EXISTS project (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                data BLOB
            );
            CREATE TABLE IF NOT EXISTS blacklist (
                user_id TEXT PRIMARY KEY
            );
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            CREATE TABLE IF NOT EXISTS snapshot_assets (
                snapshot_key TEXT,
                hash TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_snapshot_assets_key ON snapshot_assets(snapshot_key);
        `);
    }

    /**
     * Persist the current session state on the WebSocket so it survives
     * Cloudflare DO hibernation. Called whenever clientIds, userId, or role
     * changes for a session.
     */
    private persistSessionAttachment(ws: WebSocket): void {
        const session = this.sessions.get(ws);
        if (!session) return;
        ws.serializeAttachment({
            userId: session.userId,
            role: session.role,
            clientIds: Array.from(session.clientIds),
        });
    }

    /**
     * Apply pending project-doc migrations to the in-memory doc and persist
     * the result. Idempotent: a no-op when the doc is already at
     * CURRENT_PROJECT_VERSION.
     */
    private async runDocMigration(): Promise<void> {
        const outcome = await migrateProjectDocCore({ ydoc: this.doc });
        switch (outcome.kind) {
            case "up-to-date":
                this.docVersion = outcome.version;
                break;
            case "migrated":
                this.docVersion = outcome.to;
                console.log(JSON.stringify({ event: "document_migrated", fromVersion: outcome.from, toVersion: outcome.to, steps: outcome.appliedSteps.length }));
                // Persist the migrated state immediately so a restart doesn't replay.
                await this.saveToDisk();
                break;
            case "future-version":
                // The on-disk doc is at a version newer than this worker knows.
                // Refuse new connections until the worker is upgraded.
                this.docMigrationFailed = true;
                this.docVersion = outcome.storedVersion;
                console.error(JSON.stringify({ event: "document_migration_future_version", storedVersion: outcome.storedVersion, expectedVersion: outcome.expected, message: "Worker is out of date — refusing connections." }));
                break;
            case "failed":
                this.docMigrationFailed = true;
                this.docVersion = outcome.from;
                console.error(JSON.stringify({ event: "document_migration_failed", failedAtStep: outcome.failedAt, storedVersion: outcome.from, error: String(outcome.error) }));
                break;
        }
    }

    /**
     * Track upward changes to metadata.version so the connection gatekeeper
     * always sees the latest doc version (e.g., after a higher-version client
     * propagates a migration we don't yet know about — would-be future-version).
     */
    private observeDocVersion(): void {
        const map = this.doc.getMap("metadata") as Y.Map<unknown>;
        map.observe(() => {
            const v = map.get("version");
            if (typeof v === "number" && v > this.docVersion) {
                this.docVersion = v;
            }
        });
    }

    /**
     * Mark the document as dirty and schedule an R2 snapshot alarm.
     */
    markDirty(): void {
        if (this.purgedAt !== null) return;
        this.isDirty = true;
        this.scheduleSnapshotAlarm();
    }

    /**
     * Schedule a Cloudflare Alarm for R2 snapshot if not already pending.
     */
    private async scheduleSnapshotAlarm(): Promise<void> {
        // Never overwrite the self-destruct alarm with a snapshot alarm — that
        // would postpone the teardown indefinitely and re-snapshot a dead room.
        if (this.purgedAt !== null) return;
        if (this.alarmScheduled) return;
        const currentAlarm = await this.ctx.storage.getAlarm();
        if (currentAlarm) {
            this.alarmScheduled = true;
            return;
        }
        await this.ctx.storage.setAlarm(Date.now() + SNAPSHOT_INTERVAL_MS);
        this.alarmScheduled = true;
    }

    /**
     * Cloudflare Alarm handler — snapshots to R2 and runs retention cleanup.
     */
    async alarm(): Promise<void> {
        this.alarmScheduled = false;

        // Self-destruct. The tombstone has now outlived every cloud token that
        // could still have reached this room, so there is nothing left to
        // refuse. Delete the last of the storage and write nothing back: a
        // Durable Object that holds no storage stops existing, which is the
        // only way a room addressed by name is ever reclaimed.
        //
        // `purgedAt` deliberately stays set. Storage is empty but this instance
        // never ran `ensureSchema`, so it must keep refusing until it is
        // evicted; a later incarnation of the same name reads no tombstone and
        // starts clean.
        if (this.purgedAt !== null) {
            await this.ctx.storage.deleteAll();
            console.log(JSON.stringify({ event: "room_self_destructed", purgedAt: this.purgedAt }));
            return;
        }

        if (!this.isDirty) return;
        this.isDirty = false;

        // Save to SQLite (hot storage)
        await this.saveToDisk();

        // Snapshot to R2 (cold storage)
        if (this.projectId) {
            try {
                const state = Y.encodeStateAsUpdate(this.doc);
                const timestamp = new Date().toISOString();
                const key = `${this.projectId}/auto/${timestamp}`;
                await (this.env as Env).SNAPSHOTS.put(key, state, {
                    customMetadata: { type: "auto" },
                });
                this.indexSnapshotAssets(key);
                console.log(JSON.stringify({ event: "snapshot_saved", key }));

                // Run retention cleanup (prunes old snapshots + reclaims their assets)
                await this.cleanupAutoSaves();
            } catch (e) {
                console.error(JSON.stringify({ event: "snapshot_failed", error: String(e) }));
                // Re-mark dirty so next alarm retries
                this.isDirty = true;
                this.scheduleSnapshotAlarm();
            }
        }
    }

    /**
     * Tiered retention cleanup for auto-saves.
     * - 0–1 hour: keep all (~1 min granularity)
     * - 1–24 hours: keep one per 30-min window
     * - 1–30 days: keep one per day
     * - 30+ days: delete
     */
    private async cleanupAutoSaves(): Promise<void> {
        if (!this.projectId) return;

        const prefix = `${this.projectId}/auto/`;
        const listed = await (this.env as Env).SNAPSHOTS.list({ prefix, limit: 1000 });
        if (listed.objects.length === 0) return;

        const now = Date.now();
        const toDelete: string[] = [];

        // Group saves by time windows for each retention tier
        const tier30min = new Map<number, R2Object[]>(); // 1h–24h: 30-min windows
        const tierDaily = new Map<number, R2Object[]>(); // 1d–30d: daily windows

        for (const obj of listed.objects) {
            const age = now - obj.uploaded.getTime();

            if (age > RETENTION_30_DAYS_MS) {
                // Older than 30 days: delete
                toDelete.push(obj.key);
            } else if (age > RETENTION_DAY_MS) {
                // 1–30 days: keep one per day
                const dayWindow = Math.floor(obj.uploaded.getTime() / RETENTION_DAY_MS);
                if (!tierDaily.has(dayWindow)) tierDaily.set(dayWindow, []);
                tierDaily.get(dayWindow)!.push(obj);
            } else if (age > RETENTION_HOUR_MS) {
                // 1–24 hours: keep one per 30-min window
                const window30 = Math.floor(obj.uploaded.getTime() / RETENTION_INTERVAL_30MIN_MS);
                if (!tier30min.has(window30)) tier30min.set(window30, []);
                tier30min.get(window30)!.push(obj);
            }
            // 0–1 hour: keep all (no action)
        }

        // For each window, keep the latest, delete the rest
        for (const [, objects] of tier30min) {
            if (objects.length > 1) {
                objects.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());
                for (let i = 1; i < objects.length; i++) {
                    toDelete.push(objects[i].key);
                }
            }
        }

        for (const [, objects] of tierDaily) {
            if (objects.length > 1) {
                objects.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());
                for (let i = 1; i < objects.length; i++) {
                    toDelete.push(objects[i].key);
                }
            }
        }

        // Batch delete (R2 supports up to 1000 keys per delete)
        if (toDelete.length > 0) {
            await (this.env as Env).SNAPSHOTS.delete(toDelete);
            this.unindexSnapshots(toDelete);
            console.log(JSON.stringify({ event: "retention_cleanup", deletedCount: toDelete.length }));
            // Pruning snapshots may have orphaned assets — reclaim them now,
            // rather than waiting for the next project open.
            await this.triggerAssetGc();
        }
    }

    /**
     * Store projectId on first connection so the DO knows its identity across restarts.
     */
    private persistProjectId(id: string): void {
        if (this.projectId === id) return;
        this.projectId = id;
        this.ctx.storage.sql.exec("INSERT OR REPLACE INTO config (key, value) VALUES ('projectId', ?);", id);
    }

    /**
     * Throttled inline cleanup. Called from message/connect paths instead of
     * setInterval — a live timer would prevent the DO from hibernating, which
     * keeps it billed continuously. With this approach the DO only does
     * cleanup work when traffic is already arriving.
     */
    maybeCleanupStaleAwareness(): void {
        const now = Date.now();
        if (now - this.lastAwarenessCleanup < AWARENESS_CLEANUP_INTERVAL_MS) return;
        this.lastAwarenessCleanup = now;
        this.cleanupStaleAwareness();
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
                console.log(JSON.stringify({ event: "stale_session", userId: session.userId, timeSinceActivity }));
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
                awarenessProtocol.encodeAwarenessUpdate(this.awareness, staleClientIds),
            );
            this.broadcast(encoding.toUint8Array(encoder), undefined);

            // Step 4: Close the stale sockets last — webSocketClose will find
            // no session entry and exit immediately.
            for (const socket of staleSockets) {
                try {
                    if (socket.readyState === 1) {
                        socket.close(4000, "Connection stale");
                    }
                } catch {
                    // Socket might already be closed
                }
            }

            console.log(JSON.stringify({ event: "cleaned_stale_awareness", count: staleClientIds.length }));
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

        // A tombstoned room refuses everything, before any code below can write
        // to storage (`persistProjectId` would). This is the whole point of the
        // tombstone: cloud tokens stay valid for an hour after the project row
        // is deleted, and the WebSocket gate only checks the token — so a client
        // that happened to be idle-disconnected during the purge would otherwise
        // reconnect, find a blank room, and re-upload its local copy of the
        // project into storage that nothing can ever reach or reclaim again.
        if (this.purgedAt !== null) {
            // A retried teardown must not re-arm the self-destruct clock, so
            // answer purges idempotently instead of rejecting them.
            if (request.method === "POST" && url.pathname === "/purge") {
                return Response.json({ deletedSnapshots: 0, alreadyPurged: true }, { status: 200 });
            }
            return new Response("Project deleted", { status: 410 });
        }

        // Persist projectId from header (set by the outer worker fetch)
        const headerProjectId = request.headers.get("X-Project-Id");
        if (headerProjectId) {
            this.persistProjectId(headerProjectId);
        }

        // ---- Saves endpoints ----

        // GET /saves — list all saves
        if (request.method === "GET" && url.pathname === "/saves") {
            return this.handleListSaves();
        }

        // GET /asset-refs — asset hashes referenced by the live doc + every snapshot
        if (request.method === "GET" && url.pathname === "/asset-refs") {
            return this.handleAssetRefs();
        }

        // POST /saves/manual — create manual save
        if (request.method === "POST" && url.pathname === "/saves/manual") {
            const { name } = (await request.json()) as { name?: string };
            if (!name) {
                return new Response("Missing name", { status: 400 });
            }
            return this.handleCreateManualSave(name);
        }

        // POST /saves/restore — restore a save
        if (request.method === "POST" && url.pathname === "/saves/restore") {
            const { key } = (await request.json()) as { key?: string };
            if (!key) {
                return new Response("Missing key", { status: 400 });
            }
            return this.handleRestore(key);
        }

        // PATCH /saves/manual — rename a manual save
        if (request.method === "PATCH" && url.pathname === "/saves/manual") {
            const { key, name } = (await request.json()) as { key?: string; name?: string };
            if (!key || !name) {
                return new Response("Missing key or name", { status: 400 });
            }
            return this.handleRename(key, name);
        }

        // POST /purge — wipe the room (project or owner account deleted)
        if (request.method === "POST" && url.pathname === "/purge") {
            return this.handlePurge();
        }

        // DELETE /saves — delete a save
        if (request.method === "DELETE" && url.pathname === "/saves") {
            const { key } = (await request.json()) as { key?: string };
            if (!key) {
                return new Response("Missing key", { status: 400 });
            }
            return this.handleDeleteSave(key);
        }

        // ---- Existing endpoints ----

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

            console.log(JSON.stringify({ event: "user_blacklisted", userId }));
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

            console.log(JSON.stringify({ event: "user_allowed", userId }));
            return new Response(`User ${userId} allowed.`, { status: 200 });
        }

        // Role-update endpoint — push a role change to a connected user.
        // Updates the in-memory SessionInfo so the protocol's write gate uses
        // the new role on the next message, and notifies the client so its
        // local `project.role` updates without a manual refresh. We don't
        // close the socket: the existing JWT carries the OLD role, but the
        // server-side gate is the source of truth and is now correct.
        if (request.method === "POST" && url.pathname === "/role-update") {
            const { userId, role } = (await request.json()) as { userId?: string; role?: string };
            if (!userId || !role) {
                return new Response("Missing userId or role", { status: 400 });
            }

            const socket = this.userConnections.get(userId);
            if (socket) {
                const session = this.sessions.get(socket);
                if (session) {
                    session.role = role;
                    this.persistSessionAttachment(socket);
                }
                try {
                    const encoder = encoding.createEncoder();
                    encoding.writeVarUint(encoder, 100); // custom message type: role-update
                    encoding.writeVarString(encoder, role);
                    socket.send(encoding.toUint8Array(encoder));
                } catch (e) {
                    console.error(JSON.stringify({ event: "role_update_push_failed", userId, error: String(e) }));
                }
            }

            console.log(JSON.stringify({ event: "role_updated", userId, role }));
            return new Response(`User ${userId} role updated.`, { status: 200 });
        }

        // WebSocket upgrade
        if (request.headers.get("Upgrade") === "websocket") {
            const userId = request.headers.get("X-User-Id");
            if (!userId) {
                return new Response("Missing User Identity", { status: 400 });
            }
            const role = request.headers.get("X-User-Role") || "VIEWER";

            if (this.blacklist.has(userId)) {
                return new Response("Unauthorized: You have been kicked.", { status: 403 });
            }

            // Server-side migration gatekeeper. Refuse the upgrade if
            // server-side migration failed — data integrity is at risk and
            // the project should be inspected manually.
            if (this.docMigrationFailed) {
                return new Response("Project temporarily unavailable", { status: 503 });
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
                } catch {
                    // Socket might already be closed
                }
            }

            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);

            this.ctx.acceptWebSocket(server);

            // Stale-client gate: reject clients whose bundle is older than
            // the doc's schema version. Sending sync to them would let them
            // write back the pre-migration shape and corrupt the doc.
            const clientVersionParam = url.searchParams.get("clientVersion");
            const clientVersion = clientVersionParam !== null ? Number(clientVersionParam) : NaN;
            if (Number.isFinite(clientVersion) && clientVersion < this.docVersion) {
                console.warn(JSON.stringify({ event: "client_rejected_stale", clientVersion, docVersion: this.docVersion }));
                try {
                    server.close(4006, `Stale client: update to access v${this.docVersion}`);
                } catch {}
                return new Response(null, { status: 101, webSocket: client });
            }

            // Initialize session
            this.sessions.set(server, {
                clientIds: new Set(),
                userId,
                role,
                lastActivity: Date.now(),
            });
            this.userConnections.set(userId, server);
            // Persist immediately so a hibernation-wake before the first
            // awareness message can still identify this socket.
            this.persistSessionAttachment(server);

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
                    Array.from(awarenessStates.keys()),
                );
                encoding.writeVarUint(awarenessEncoder, 1);
                encoding.writeVarUint8Array(awarenessEncoder, awarenessUpdate);
                server.send(encoding.toUint8Array(awarenessEncoder));
            }

            console.log(JSON.stringify({ event: "user_connected", userId, totalSessions: this.sessions.size }));

            // Opportunistic cleanup on connect — a new client arriving is the
            // best moment to drop awareness for clients that quietly went away.
            this.maybeCleanupStaleAwareness();

            // Request all existing clients to re-broadcast their awareness
            // This ensures the new client receives everyone's current state,
            // especially important after a DurableObject restart where
            // the server's awareness cache may be empty or stale
            if (this.sessions.size > 1) {
                this.broadcastAwarenessRequest(server);
            }
            return new Response(null, { status: 101, webSocket: client });
        }

        return new Response("Not Found", { status: 404 });
    }

    // ---- Asset GC support ----

    /** Marker hash recorded when a snapshot's board cards couldn't be parsed, so
     *  reference computation reports `complete: false` and the caller skips GC. */
    private static readonly UNPARSED = "__unparsed__";

    /**
     * Record the asset hashes a snapshot references, into the `snapshot_assets`
     * index. Called right after a snapshot is written to R2 — the doc is in
     * memory, so this is cheap (no decode). On a parse failure we store a marker
     * so GC stays conservative.
     */
    private indexSnapshotAssets(snapshotKey: string): void {
        let hashes: Set<string>;
        try {
            hashes = collectReferencedHashes(this.doc);
        } catch {
            this.ctx.storage.sql.exec(
                "INSERT INTO snapshot_assets (snapshot_key, hash) VALUES (?, ?)",
                snapshotKey,
                ProjectRoom.UNPARSED,
            );
            return;
        }
        for (const hash of hashes) {
            this.ctx.storage.sql.exec(
                "INSERT INTO snapshot_assets (snapshot_key, hash) VALUES (?, ?)",
                snapshotKey,
                hash,
            );
        }
    }

    /** Drop a snapshot's rows from the index (after it's deleted/expired). */
    private unindexSnapshots(snapshotKeys: string[]): void {
        for (const key of snapshotKeys) {
            this.ctx.storage.sql.exec("DELETE FROM snapshot_assets WHERE snapshot_key = ?", key);
        }
    }

    /** Re-key a snapshot's rows (rename re-puts under a new key). */
    private rekeySnapshot(oldKey: string, newKey: string): void {
        this.ctx.storage.sql.exec(
            "UPDATE snapshot_assets SET snapshot_key = ? WHERE snapshot_key = ?",
            newKey,
            oldKey,
        );
    }

    /**
     * The asset hashes referenced by the live doc plus every retained snapshot
     * (the latter read cheaply from the `snapshot_assets` index — no snapshot
     * decode). `complete` is false if the live doc or any indexed snapshot
     * couldn't be parsed, so the caller skips deletion.
     */
    private computeReferencedHashes(): { hashes: string[]; complete: boolean } {
        const referenced = new Set<string>();
        let complete = true;

        try {
            for (const hash of collectReferencedHashes(this.doc)) referenced.add(hash);
        } catch {
            complete = false;
        }

        const cursor = this.ctx.storage.sql.exec("SELECT DISTINCT hash FROM snapshot_assets");
        for (const row of cursor) {
            const hash = row.hash as string;
            if (hash === ProjectRoom.UNPARSED) {
                complete = false;
                continue;
            }
            referenced.add(hash);
        }

        return { hashes: [...referenced], complete };
    }

    /**
     * Tell the Next.js app to reclaim now-orphaned R2 assets. Called after a
     * snapshot is deleted/expired (the moment an asset can become unreferenced
     * without any user action). Best-effort — failures are retried on the next
     * retention pass or the next project open.
     */
    private async triggerAssetGc(): Promise<void> {
        const env = this.env as Env;
        if (!this.projectId || !env.API_URL) return;
        try {
            const { hashes, complete } = this.computeReferencedHashes();
            const token = await new SignJWT({ type: "asset-gc", projectId: this.projectId })
                .setProtectedHeader({ alg: "HS256" })
                .setExpirationTime("1m")
                .sign(new TextEncoder().encode(env.JWT_SECRET));

            await fetch(`${env.API_URL}/api/internal/asset-gc`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ projectId: this.projectId, referenced: hashes, complete }),
            });
        } catch (e) {
            console.error(JSON.stringify({ event: "asset_gc_trigger_failed", error: String(e) }));
        }
    }

    /**
     * Asset hashes referenced by the live doc + every retained snapshot, served
     * from the index (cheap). The Next.js asset GC route deletes only assets in
     * none of these, so restoring an older save never loses its images/audio.
     */
    private handleAssetRefs(): Response {
        return Response.json(this.computeReferencedHashes(), { status: 200 });
    }

    // ---- Save/Restore handlers ----

    private async handleListSaves(): Promise<Response> {
        if (!this.projectId) {
            return Response.json([], { status: 200 });
        }

        const saves: SaveEntry[] = [];

        // List auto-saves
        const autoList = await (this.env as Env).SNAPSHOTS.list({
            prefix: `${this.projectId}/auto/`,
            limit: 1000,
        });
        for (const obj of autoList.objects) {
            saves.push({
                key: obj.key,
                type: "auto",
                date: obj.uploaded.toISOString(),
                size: obj.size,
            });
        }

        // List manual saves
        const manualList = await (this.env as Env).SNAPSHOTS.list({
            prefix: `${this.projectId}/manual/`,
            limit: 1000,
        });
        for (const obj of manualList.objects) {
            // R2 list doesn't include customMetadata. We parse the name from the key delimiter.
            const parts = obj.key.split("___");
            const name = parts.length > 1 ? decodeURIComponent(parts[1]) : undefined;

            saves.push({
                key: obj.key,
                type: "manual",
                name: name,
                date: obj.uploaded.toISOString(),
                size: obj.size,
            });
        }

        // Sort by date descending
        saves.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return Response.json(saves, { status: 200 });
    }

    private async handleCreateManualSave(name: string): Promise<Response> {
        if (!this.projectId) {
            return new Response("Project not initialized", { status: 400 });
        }

        // Save to SQLite first to ensure consistency
        await this.saveToDisk();

        const state = Y.encodeStateAsUpdate(this.doc);
        const timestamp = new Date().toISOString();
        // Append encoded name to key because R2 list() doesn't return metadata
        const key = `${this.projectId}/manual/${timestamp}___${encodeURIComponent(name)}`;

        await (this.env as Env).SNAPSHOTS.put(key, state, {
            customMetadata: { type: "manual", name },
        });
        this.indexSnapshotAssets(key);

        console.log(JSON.stringify({ event: "manual_save_created", name }));

        const entry: SaveEntry = { key, type: "manual", name, date: timestamp, size: state.byteLength };
        return Response.json(entry, { status: 201 });
    }

    private async handleRestore(key: string): Promise<Response> {
        // Validate key belongs to this project
        if (this.projectId && !key.startsWith(this.projectId + "/")) {
            return new Response("Invalid key", { status: 403 });
        }

        const obj = await (this.env as Env).SNAPSHOTS.get(key);
        if (!obj) {
            return new Response("Save not found", { status: 404 });
        }

        const data = new Uint8Array(await obj.arrayBuffer());

        // Yjs CRDTs are additive — Y.applyUpdate cannot roll back state.
        // We must replace the live doc entirely with a fresh one from the snapshot,
        // then close all connected clients (code 4005) so they reconnect and
        // re-sync against the restored state with a clean local doc.

        // 1. Detach listeners and tear down the old doc + awareness.
        this.doc.off("update", this.handleDocUpdate);
        this.doc.destroy();
        this.awareness.destroy();

        // 2. Build the restored doc.
        this.doc = new ProjectState();
        this.doc.on("update", this.handleDocUpdate);
        Y.applyUpdate(this.doc, data);

        // 3. Rebuild awareness bound to the new doc.
        this.awareness = new awarenessProtocol.Awareness(this.doc);
        clearInterval((this.awareness as unknown as { _checkInterval: ReturnType<typeof setInterval> })._checkInterval);
        this.awareness.setLocalState(null);
        this.awareness.on("update", this.handleAwarenessUpdate);

        // 4. Migrate the restored doc forward — snapshots can be from any
        //    historical version. Resets docMigrationFailed so this restore
        //    attempt has a clean slate; runDocMigration will set it again
        //    if migration fails on the restored data.
        this.docMigrationFailed = false;
        this.docVersion = readProjectDocVersion(this.doc);
        await this.runDocMigration();
        this.observeDocVersion();

        // 5. Persist the restored (and possibly migrated) state to SQLite.
        await this.saveToDisk();

        // 6. Close all connected clients with "document-restored" (4005).
        //    The client provider will clear its local cache and reload so it
        //    reconnects with an empty doc and receives the restored state via sync.
        for (const [socket] of this.sessions) {
            try {
                if (socket.readyState === 1) socket.close(4005, "Document restored");
            } catch {}
        }
        this.sessions.clear();
        this.userConnections.clear();

        console.log(JSON.stringify({ event: "restored_from_save", key }));
        return new Response("Restored", { status: 200 });
    }

    private async handleRename(key: string, name: string): Promise<Response> {
        // Validate key belongs to this project and is manual
        if (this.projectId && !key.startsWith(`${this.projectId}/manual/`)) {
            return new Response("Can only rename manual saves", { status: 400 });
        }

        const obj = await (this.env as Env).SNAPSHOTS.get(key);
        if (!obj) {
            return new Response("Save not found", { status: 404 });
        }

        // Calculate new key with updated name delimiter
        const keyParts = key.split("___");
        const newKey = keyParts[0] + "___" + encodeURIComponent(name);

        // R2 doesn't support key renames; re-put data with new key and delete old one
        const data = await obj.arrayBuffer();
        await (this.env as Env).SNAPSHOTS.put(newKey, data, {
            customMetadata: { type: "manual", name },
        });
        await (this.env as Env).SNAPSHOTS.delete(key);
        this.rekeySnapshot(key, newKey); // refs unchanged — just follow the key

        console.log(JSON.stringify({ event: "save_renamed", key, name }));
        return new Response("Renamed", { status: 200 });
    }

    /**
     * Wipe the room for good: every R2 snapshot under the project prefix, all
     * Durable Object storage (live doc, blacklist, config, snapshot index,
     * pending alarm) and every live connection.
     *
     * A DO is addressed by name, so nothing ever reclaims it on its own — the
     * project's SQLite and its snapshots would outlive the project (and its
     * owner's account) forever without this.
     *
     * What survives is a tombstone and an alarm. Closing the live sockets only
     * reaches clients that happen to be connected, and the client disconnects
     * itself after 30s idle while its cloud token stays valid for an hour, so
     * for that hour a reconnect could still land here and re-upload the project
     * we just deleted. The tombstone refuses those; the alarm then deletes the
     * tombstone once no valid token can exist anymore, leaving nothing behind.
     */
    private async handlePurge(): Promise<Response> {
        // Drop connected clients first: an in-flight edit landing after the
        // wipe would repopulate the doc we are about to delete. 4003 is the
        // kick code — clients stop reconnecting and surface the
        // project-unavailable dialog instead of retrying against a dead room.
        for (const [socket] of this.sessions) {
            try {
                if (socket.readyState === 1) socket.close(4003, "Project deleted");
            } catch {
                // Socket might already be closed
            }
        }
        this.sessions.clear();
        this.userConnections.clear();

        // Cancel pending save/snapshot work so nothing writes storage back.
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        this.isDirty = false;

        const deletedSnapshots = await this.deleteAllSnapshots();

        await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.deleteAll();
        this.alarmScheduled = false;
        this.blacklist.clear();
        this.projectId = null;

        const purgedAt = Date.now();
        this.purgedAt = purgedAt;

        // Drop the screenplay from memory as well — otherwise the doc outlives
        // the storage it was wiped from, still attached to the save pipeline.
        this.resetDoc();

        // Leave a tombstone. deleteAll dropped the schema, so recreate only the
        // table it lives in: a purged room is not meant to be usable again,
        // just to answer "gone" to the clients whose cloud tokens outlive the
        // project. Once the last of those has expired the alarm deletes this
        // final row, and the room — which nothing else would ever reclaim —
        // ceases to exist.
        this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);");
        this.ctx.storage.sql.exec(
            "INSERT OR REPLACE INTO config (key, value) VALUES ('purgedAt', ?);",
            String(purgedAt),
        );
        await this.ctx.storage.setAlarm(purgedAt + PURGE_TOMBSTONE_GRACE_MS);

        console.log(
            JSON.stringify({
                event: "room_purged",
                deletedSnapshots,
                selfDestructAt: new Date(purgedAt + PURGE_TOMBSTONE_GRACE_MS).toISOString(),
            }),
        );
        return Response.json({ deletedSnapshots }, { status: 200 });
    }

    /** Delete every snapshot stored for this project. Returns the count. */
    private async deleteAllSnapshots(): Promise<number> {
        if (!this.projectId) return 0;

        const bucket = (this.env as Env).SNAPSHOTS;
        const prefix = `${this.projectId}/`;
        let deleted = 0;

        // Re-list from the start on each pass rather than paginating with a
        // cursor: everything listed is deleted before the next call, so the
        // next page is always what's left.
        for (;;) {
            const listed = await bucket.list({ prefix, limit: 1000 });
            if (listed.objects.length === 0) break;

            await bucket.delete(listed.objects.map((o) => o.key));
            deleted += listed.objects.length;

            if (!listed.truncated) break;
        }

        return deleted;
    }

    /** Replace the live doc (and its awareness) with an empty one. */
    private resetDoc(): void {
        this.doc.off("update", this.handleDocUpdate);
        this.doc.destroy();
        this.awareness.destroy();

        this.doc = new ProjectState();
        this.awareness = new awarenessProtocol.Awareness(this.doc);
        clearInterval((this.awareness as unknown as { _checkInterval: ReturnType<typeof setInterval> })._checkInterval);
        this.awareness.setLocalState(null);
        this.awareness.on("update", this.handleAwarenessUpdate);
        this.doc.on("update", this.handleDocUpdate);
    }

    private async handleDeleteSave(key: string): Promise<Response> {
        // Validate key belongs to this project
        if (this.projectId && !key.startsWith(this.projectId + "/")) {
            return new Response("Invalid key", { status: 403 });
        }

        await (this.env as Env).SNAPSHOTS.delete(key);
        this.unindexSnapshots([key]);
        console.log(JSON.stringify({ event: "save_deleted", key }));
        // Deleting a save may have orphaned assets — reclaim them now.
        await this.triggerAssetGc();
        return new Response("Deleted", { status: 200 });
    }

    // ---- WebSocket handlers ----

    async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
        // A socket that survived the purge (hibernated, so it was never in
        // `sessions` to be closed) must not be answered: with no session to
        // check a role against, the protocol would treat it as a writer and
        // apply its doc updates.
        if (this.purgedAt !== null) {
            try {
                if (ws.readyState === 1) ws.close(4003, "Project deleted");
            } catch {
                // Socket might already be closed
            }
            return;
        }

        if (!(message instanceof ArrayBuffer)) return;

        const fullMessage = new Uint8Array(message);
        if (fullMessage.length === 0) return;

        handleProtocolMessage(this, fullMessage, ws);
        this.maybeCleanupStaleAwareness();
    }

    scheduleSave(): void {
        if (this.purgedAt !== null) return;
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => this.saveToDisk(), SAVE_DEBOUNCE_MS);
    }

    async saveToDisk(): Promise<void> {
        // The schema is gone after a purge; writing would resurrect it.
        if (this.purgedAt !== null) return;
        try {
            const fullDocState = Y.encodeStateAsUpdate(this.doc);
            this.ctx.storage.sql.exec("INSERT OR REPLACE INTO project (id, data) VALUES (1, ?);", fullDocState);
            this.saveTimeout = null;
            console.log(JSON.stringify({ event: "document_saved" }));
        } catch (e) {
            console.error(JSON.stringify({ event: "document_save_failed", error: String(e) }));
        }
    }

    async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
        const session = this.sessions.get(ws);

        if (session) {
            console.log(JSON.stringify({ event: "websocket_close", userId: session.userId }));

            if (session.clientIds.size > 0) {
                const clientIds = Array.from(session.clientIds);

                // Remove awareness states
                awarenessProtocol.removeAwarenessStates(this.awareness, clientIds, null);

                // Broadcast removal to remaining clients
                this.broadcastAwarenessRemoval(clientIds, ws);

                console.log(JSON.stringify({ event: "awareness_removed", clientIds }));
            }

            // Only delete from userConnections if this is the active entry
            if (this.userConnections.get(session.userId) === ws) {
                this.userConnections.delete(session.userId);
            }
        }

        this.sessions.delete(ws);
        console.log(JSON.stringify({ event: "session_count_update", count: this.sessions.size }));
    }

    async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
        const errStr = String(error);
        if (errStr.includes("Network connection lost") || errStr.includes("WebSocket disconnected") || errStr.includes("1006") || errStr.includes("1005")) {
            console.log(JSON.stringify({
                event: "websocket_disconnect",
                level: "info",
                reason: "idle or network connection lost",
                error: errStr
            }));
        } else {
            console.error(JSON.stringify({
                event: "websocket_error",
                error: errStr
            }));
        }
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
        console.log(JSON.stringify({ event: "awareness_request_sent" }));
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
                    console.error(JSON.stringify({ event: "send_to_client_failed", userId: session.userId, error: String(e) }));
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
