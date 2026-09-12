/// <reference types="@cloudflare/workers-types" />

export interface Env {
    PROJECT_ROOM: DurableObjectNamespace;
    JWT_SECRET: string;
    SNAPSHOTS: R2Bucket;
    /** Base URL of the Next.js app, for the asset-GC callback (e.g. https://scenarly.com). */
    API_URL: string;
}

// Configuration
export const SAVE_DEBOUNCE_MS = 2000;
export const SNAPSHOT_INTERVAL_MS = 60_000; // 1 minute between R2 snapshots
export const STALE_AWARENESS_TIMEOUT_MS = 60000; // 60 seconds
export const AWARENESS_CLEANUP_INTERVAL_MS = 30000; // Check every 30 seconds

/**
 * Lifetime of a project cloud token, issued by `/api/projects/[projectId]/cloud-token`.
 *
 * The WebSocket gate only verifies the JWT — it never re-reads the database —
 * so a token keeps opening connections for this long after the project row is
 * deleted. That window is what a purged room has to defend against.
 */
export const CLOUD_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * How long a purged room keeps its tombstone before self-destructing.
 *
 * The token TTL is the real deadline: once the last token issued before the
 * deletion has expired, nothing can reach the room and there is nothing left to
 * refuse. The extra hour is slack for clock skew between the app that signs
 * tokens and the Worker that checks them.
 */
export const PURGE_TOMBSTONE_GRACE_MS = CLOUD_TOKEN_TTL_MS + 60 * 60 * 1000;

// Retention thresholds and the tiering that uses them live in
// `src/lib/saves/retention.ts`, shared with the device-local history.

export interface SessionInfo {
    clientIds: Set<number>;
    userId: string;
    /** Project role from the JWT — used to gate doc writes (VIEWER is read-only). */
    role: string;
    lastActivity: number;
}
