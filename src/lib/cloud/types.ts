/// <reference types="@cloudflare/workers-types" />

export interface Env {
    SCREENPLAY_ROOM: DurableObjectNamespace;
    JWT_SECRET: string;
    SNAPSHOTS: R2Bucket;
}

// Configuration
export const SAVE_DEBOUNCE_MS = 2000;
export const SNAPSHOT_INTERVAL_MS = 60_000; // 1 minute between R2 snapshots
export const STALE_AWARENESS_TIMEOUT_MS = 60000; // 60 seconds
export const AWARENESS_CLEANUP_INTERVAL_MS = 30000; // Check every 30 seconds

// Retention thresholds
export const RETENTION_HOUR_MS = 60 * 60 * 1000;
export const RETENTION_DAY_MS = 24 * RETENTION_HOUR_MS;
export const RETENTION_30_DAYS_MS = 30 * RETENTION_DAY_MS;
export const RETENTION_INTERVAL_30MIN_MS = 30 * 60 * 1000;

export interface SessionInfo {
    clientIds: Set<number>;
    userId: string;
    lastActivity: number;
}

export interface SaveEntry {
    key: string;
    type: "auto" | "manual";
    name?: string;
    date: string;
    size: number;
}
