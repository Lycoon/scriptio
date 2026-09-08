/**
 * Tiered retention for auto-saves — how a version history stays useful without
 * growing forever.
 *
 * The shape of the tiers comes from what a writer actually reaches back for:
 * "what did I just delete" is a question about the last few minutes, so the last
 * hour is kept whole; "where was this scene yesterday" tolerates half-hour
 * granularity; anything older is a landmark, and one per day is plenty. Manual
 * saves answer none of these — the user named them, so they are never pruned and
 * never passed in here.
 *
 * Pure and shared: the Cloudflare DurableObject runs it over R2 listings, the
 * local pruner over IndexedDB rows. It was inline in `room.ts` before, where it
 * could not be tested and could not be reused; keeping one copy is also the only
 * way the two histories stay recognisably the same feature.
 */

/** A snapshot as the tiering sees it — when it was taken and what it costs. */
export interface RetainableSnapshot {
    key: string;
    /** Epoch ms. */
    createdAt: number;
    size: number;
}

export const RETENTION_HOUR_MS = 60 * 60 * 1000;
export const RETENTION_DAY_MS = 24 * RETENTION_HOUR_MS;
export const RETENTION_30_DAYS_MS = 30 * RETENTION_DAY_MS;
export const RETENTION_INTERVAL_30MIN_MS = 30 * 60 * 1000;

/**
 * How much of a device's storage a single project's history may hold.
 *
 * The cloud has no equivalent: R2 is billed, effectively unbounded, and the
 * tiers alone are enough. IndexedDB is neither — a browser evicts the whole
 * origin when it runs out, taking the *live* documents with it, so an unbounded
 * history is a way to lose the work it exists to protect.
 */
export const LOCAL_SNAPSHOT_BUDGET_BYTES = 100 * 1024 ** 2;

/**
 * The auto-save keys that should be deleted now.
 *
 * Tiers, by age: keep everything under an hour; one per 30-minute window out to
 * 24 hours; one per day out to 30 days; nothing beyond that. Within a window the
 * newest survives — an older snapshot in the same window is strictly less useful
 * than the one that came after it.
 *
 * `budgetBytes` is a second pass on top, for callers whose storage is finite: it
 * drops the oldest *survivors* until the rest fit. Oldest first because the tiers
 * have already decided that recency is what makes a snapshot worth keeping.
 */
export function selectExpiredAutoSaves(
    snapshots: RetainableSnapshot[],
    now: number,
    options: { budgetBytes?: number } = {},
): string[] {
    const expired = new Set<string>();

    // 1h–24h and 1d–30d are bucketed on absolute time, not on age, so a window
    // is the same window on every pass — otherwise the survivor would shift as
    // `now` moved and each run would delete a different one.
    const tier30min = new Map<number, RetainableSnapshot[]>();
    const tierDaily = new Map<number, RetainableSnapshot[]>();

    for (const snapshot of snapshots) {
        const age = now - snapshot.createdAt;

        if (age > RETENTION_30_DAYS_MS) {
            expired.add(snapshot.key);
        } else if (age > RETENTION_DAY_MS) {
            const window = Math.floor(snapshot.createdAt / RETENTION_DAY_MS);
            const bucket = tierDaily.get(window);
            if (bucket) bucket.push(snapshot);
            else tierDaily.set(window, [snapshot]);
        } else if (age > RETENTION_HOUR_MS) {
            const window = Math.floor(snapshot.createdAt / RETENTION_INTERVAL_30MIN_MS);
            const bucket = tier30min.get(window);
            if (bucket) bucket.push(snapshot);
            else tier30min.set(window, [snapshot]);
        }
        // Under an hour old: kept, whatever else is in its window.
    }

    for (const bucket of [...tier30min.values(), ...tierDaily.values()]) {
        if (bucket.length < 2) continue;
        const [, ...rest] = [...bucket].sort((a, b) => b.createdAt - a.createdAt);
        for (const snapshot of rest) expired.add(snapshot.key);
    }

    const { budgetBytes } = options;
    if (budgetBytes !== undefined) {
        const survivors = snapshots
            .filter((s) => !expired.has(s.key))
            .sort((a, b) => a.createdAt - b.createdAt);
        let total = survivors.reduce((sum, s) => sum + s.size, 0);
        for (const snapshot of survivors) {
            if (total <= budgetBytes) break;
            expired.add(snapshot.key);
            total -= snapshot.size;
        }
    }

    return [...expired];
}
