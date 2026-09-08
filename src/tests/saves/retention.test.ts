import { describe, it, expect } from "vitest";

import {
    LOCAL_SNAPSHOT_BUDGET_BYTES,
    RETENTION_DAY_MS,
    RETENTION_HOUR_MS,
    RETENTION_INTERVAL_30MIN_MS,
    selectExpiredAutoSaves,
    type RetainableSnapshot,
} from "@src/lib/saves/retention";

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const MINUTE = 60_000;

/** A snapshot taken `ageMs` before `NOW`. Keys carry the age so failures read. */
const aged = (ageMs: number, size = 1): RetainableSnapshot => ({
    key: `auto-${ageMs}`,
    createdAt: NOW - ageMs,
    size,
});

const expire = (snapshots: RetainableSnapshot[], options?: { budgetBytes?: number }) =>
    selectExpiredAutoSaves(snapshots, NOW, options).sort();

describe("selectExpiredAutoSaves", () => {
    it("keeps everything under an hour old, however densely spaced", () => {
        // One a minute for the last hour — the granularity the scheduler produces.
        const recent = Array.from({ length: 59 }, (_, i) => aged((i + 1) * MINUTE));
        expect(expire(recent)).toEqual([]);
    });

    it("keeps one per 30-minute window between 1h and 24h", () => {
        // Three snapshots inside one 30-min window, ~2h old, plus one in the next.
        const base = NOW - 2 * RETENTION_HOUR_MS;
        const window = Math.floor(base / RETENTION_INTERVAL_30MIN_MS) * RETENTION_INTERVAL_30MIN_MS;
        const inWindow = [0, 5 * MINUTE, 10 * MINUTE].map((offset) => ({
            key: `w1-${offset}`,
            createdAt: window + offset,
            size: 1,
        }));
        const neighbour = {
            key: "w2",
            createdAt: window + RETENTION_INTERVAL_30MIN_MS + MINUTE,
            size: 1,
        };

        // Newest of the crowded window survives; the neighbouring window is untouched.
        expect(expire([...inWindow, neighbour])).toEqual(["w1-0", `w1-${5 * MINUTE}`]);
    });

    it("keeps one per day between 1 and 30 days", () => {
        const day = Math.floor((NOW - 5 * RETENTION_DAY_MS) / RETENTION_DAY_MS) * RETENTION_DAY_MS;
        const sameDay = [1, 7, 19].map((hour) => ({
            key: `d-${hour}`,
            createdAt: day + hour * RETENTION_HOUR_MS,
            size: 1,
        }));
        const nextDay = { key: "d-next", createdAt: day + RETENTION_DAY_MS + RETENTION_HOUR_MS, size: 1 };

        expect(expire([...sameDay, nextDay])).toEqual(["d-1", "d-7"]);
    });

    it("drops everything past 30 days", () => {
        const old = aged(31 * RETENTION_DAY_MS);
        const ancient = aged(400 * RETENTION_DAY_MS);
        const keep = aged(29 * RETENTION_DAY_MS);

        expect(expire([old, ancient, keep])).toEqual([ancient.key, old.key].sort());
    });

    it("applies all four tiers together in one pass", () => {
        const snapshots = [
            aged(2 * MINUTE), // <1h: kept
            aged(30 * MINUTE), // <1h: kept
            // Both land in the 09:30–10:00 window (windows are absolute, not
            // relative to `now`), so only the newer of the pair survives.
            aged(2 * RETENTION_HOUR_MS + 5 * MINUTE),
            aged(2 * RETENTION_HOUR_MS + 10 * MINUTE),
            aged(10 * RETENTION_DAY_MS), // 1d–30d: kept (alone in its day)
            aged(45 * RETENTION_DAY_MS), // >30d: dropped
        ];

        expect(expire(snapshots)).toEqual(
            [`auto-${2 * RETENTION_HOUR_MS + 10 * MINUTE}`, `auto-${45 * RETENTION_DAY_MS}`].sort(),
        );
    });

    it("trims the oldest survivors when the byte budget is exceeded", () => {
        // Four recent snapshots the tiers would all keep, 40 bytes each.
        const snapshots = [10, 20, 30, 40].map((minutes) => aged(minutes * MINUTE, 40));

        // Room for two: the two oldest (40 and 30 minutes ago) go.
        expect(expire(snapshots, { budgetBytes: 100 })).toEqual([
            `auto-${30 * MINUTE}`,
            `auto-${40 * MINUTE}`,
        ]);

        // A budget that already fits changes nothing.
        expect(expire(snapshots, { budgetBytes: 1_000 })).toEqual([]);
    });

    it("counts tier-expired snapshots as already gone when applying the budget", () => {
        const doomed = aged(45 * RETENTION_DAY_MS, 500); // past 30d
        const kept = aged(5 * MINUTE, 40);

        // The survivor fits in 50 bytes only because the 500-byte expired one
        // isn't counted against the budget.
        expect(expire([doomed, kept], { budgetBytes: 50 })).toEqual([doomed.key]);
    });

    it("never selects a manual save, because callers never pass one in", () => {
        // The guarantee is structural: the pruner filters to auto entries, so a
        // manual save is not in the input and cannot come out of the output.
        const autos = [aged(45 * RETENTION_DAY_MS), aged(31 * RETENTION_DAY_MS)];
        const selected = expire(autos, { budgetBytes: 0 });
        expect(selected).toEqual(autos.map((s) => s.key).sort());
        expect(selected).not.toContain("manual");
    });

    it("empties the history when the budget is zero, and no-ops on no input", () => {
        expect(expire([aged(MINUTE, 1), aged(2 * MINUTE, 1)], { budgetBytes: 0 }).length).toBe(2);
        expect(expire([])).toEqual([]);
    });

    it("budgets a hundred megabytes of local history", () => {
        expect(LOCAL_SNAPSHOT_BUDGET_BYTES).toBe(104_857_600);
    });
});
