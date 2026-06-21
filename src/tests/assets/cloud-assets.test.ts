import { describe, it, expect } from "vitest";

import { computeAssetOrphans } from "@src/lib/assets/asset-orphans";
import {
    createCachedProjectWithId,
    isCloudSyncedProject,
    deleteCachedProject,
} from "@src/lib/persistence/storage-provider/local-persistence";

const pid = () => `ctest-${Math.random().toString(36).slice(2)}`;

describe("computeAssetOrphans (cloud GC mark-sweep with grace)", () => {
    const now = 1_000_000;
    const grace = 1000;
    const old = new Date(now - grace - 1);
    const fresh = new Date(now - grace + 1);

    it("keeps referenced assets, even old ones", () => {
        const stored = [{ hash: "a", createdAt: old }];
        expect(computeAssetOrphans(stored, new Set(["a"]), now, grace)).toEqual([]);
    });

    it("collects unreferenced assets older than the grace window", () => {
        const stored = [
            { hash: "a", createdAt: old },
            { hash: "b", createdAt: old },
        ];
        expect(computeAssetOrphans(stored, new Set(["a"]), now, grace)).toEqual(["b"]);
    });

    it("spares unreferenced assets still within the grace window", () => {
        const stored = [{ hash: "b", createdAt: fresh }];
        expect(computeAssetOrphans(stored, new Set(), now, grace)).toEqual([]);
    });

    it("matches hashes case-insensitively", () => {
        const stored = [{ hash: "AbC", createdAt: old }];
        expect(computeAssetOrphans(stored, new Set(["abc"]), now, grace)).toEqual([]);
    });
});

describe("isCloudSyncedProject (gates all cloud asset requests)", () => {
    it("is false for an uncached project, so no request ever fires for one", async () => {
        expect(await isCloudSyncedProject(pid())).toBe(false);
    });

    it("is false for a local-only project and true for a synced one", async () => {
        const local = pid();
        const synced = pid();
        await createCachedProjectWithId(local, "local", undefined, false);
        await createCachedProjectWithId(synced, "synced", undefined, true);

        expect(await isCloudSyncedProject(local)).toBe(false);
        expect(await isCloudSyncedProject(synced)).toBe(true);

        await deleteCachedProject(local);
        await deleteCachedProject(synced);
    });
});
