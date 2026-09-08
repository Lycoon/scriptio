import { beforeAll, describe, it, expect } from "vitest";
import * as Y from "yjs";

import { localSavesProvider } from "@src/lib/saves/local-saves-provider";
import {
    applyLocalSnapshotRestore,
    discardLocalSnapshots,
    pruneLocalSnapshots,
    writeAutoSnapshot,
    writeManualSnapshot,
} from "@src/lib/saves/local-snapshots";
import { LOCAL_SNAPSHOT_BUDGET_BYTES, RETENTION_DAY_MS } from "@src/lib/saves/retention";
import { getStorageProvider } from "@src/lib/persistence/storage-provider/storage-provider";
import {
    createCachedProjectWithId,
    markCachedProjectAsSynced,
} from "@src/lib/persistence/storage-provider/local-persistence";
import { withProjectDoc } from "@src/lib/project/project-state";
import { ProjectState } from "@src/lib/project/project-state";
import { writeYjsDocumentLocally, yjsDbKey } from "@src/lib/persistence/y-local-provider";

const pid = () => `test-${Math.random().toString(36).slice(2)}`;

// The snapshot stores are part of the baseline schema (no version bump — the app
// is unreleased), so a profile carrying an older `scriptio-local` would lack
// them entirely. Reset it, exactly as the assets suite does.
beforeAll(async () => {
    await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("scriptio-local");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
    });
});

/** A local-only project whose Yjs document holds `title`, persisted to IndexedDB. */
async function seedLocalProject(title: string): Promise<string> {
    const projectId = pid();
    await createCachedProjectWithId(projectId, title);

    const doc = new ProjectState();
    doc.metadata().set("title", title);
    await writeYjsDocumentLocally(projectId, doc);
    doc.destroy();

    return projectId;
}

/** What the project's persisted document currently says its title is. */
const storedTitle = (projectId: string): Promise<unknown> =>
    withProjectDoc(projectId, (doc) => doc.metadata().get("title"));

/** Set the persisted document's title, as an edit would. */
async function setStoredTitle(projectId: string, title: string): Promise<void> {
    await withProjectDoc(projectId, (doc) => doc.metadata().set("title", title), { flushMs: 200 });
}

async function cleanup(projectId: string): Promise<void> {
    const provider = await getStorageProvider();
    await provider.deleteProjectSnapshots(projectId);
    await provider.deleteProjectAssets(projectId);
    await provider.delete(projectId);
    await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(yjsDbKey(projectId));
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
    });
}

describe("local saves provider", () => {
    it("round-trips create, list, rename and delete", async () => {
        const projectId = await seedLocalProject("Round trip");

        expect(await localSavesProvider.list(projectId)).toEqual([]);

        const manual = await localSavesProvider.createManual(projectId, "First draft");
        expect(manual).not.toBeNull();
        expect(manual!.type).toBe("manual");
        expect(manual!.name).toBe("First draft");
        expect(manual!.size).toBeGreaterThan(0);

        // An edit between the two, or the auto-snapshot would correctly collapse
        // into the manual one it duplicates.
        await setStoredTitle(projectId, "Round trip, edited");
        await writeAutoSnapshot(projectId);

        const listed = await localSavesProvider.list(projectId);
        expect(listed.length).toBe(2);
        // Newest first, and every entry carries a parseable ISO date.
        expect(new Date(listed[0].date).getTime()).toBeGreaterThanOrEqual(
            new Date(listed[1].date).getTime(),
        );
        expect(listed.map((s) => s.type).sort()).toEqual(["auto", "manual"]);

        // Rename is a field update: the key the panel already holds stays valid.
        await localSavesProvider.renameManual(projectId, manual!.key, "Second draft");
        const renamed = (await localSavesProvider.list(projectId)).find((s) => s.key === manual!.key);
        expect(renamed?.name).toBe("Second draft");

        await localSavesProvider.remove(projectId, manual!.key);
        const remaining = await localSavesProvider.list(projectId);
        expect(remaining.map((s) => s.key)).not.toContain(manual!.key);
        expect(remaining.length).toBe(1);

        // Deleting the metadata deletes the bytes with it.
        expect(await (await getStorageProvider()).getSnapshotData(manual!.key)).toBeNull();

        await cleanup(projectId);
    });

    it("stores a restorable document, not just a size", async () => {
        const projectId = await seedLocalProject("Restorable");
        const entry = await writeManualSnapshot(projectId, "v1");

        const data = await (await getStorageProvider()).getSnapshotData(entry.key);
        expect(data).not.toBeNull();

        const rebuilt = new ProjectState();
        Y.applyUpdate(rebuilt, new Uint8Array(data!));
        expect(rebuilt.metadata().get("title")).toBe("Restorable");
        rebuilt.destroy();

        await cleanup(projectId);
    });
});

describe("no-op auto-snapshots", () => {
    it("skips writing when the document has not moved since the last snapshot", async () => {
        const projectId = await seedLocalProject("Unchanged");
        const provider = await getStorageProvider();

        const first = await writeAutoSnapshot(projectId);
        // Nothing edited in between: the second call must not add a full copy.
        const second = await writeAutoSnapshot(projectId);

        expect(second.key).toBe(first.key);
        expect((await provider.listSnapshots(projectId)).length).toBe(1);

        // An actual edit is snapshotted normally.
        await setStoredTitle(projectId, "Moved");
        const third = await writeAutoSnapshot(projectId);
        expect(third.key).not.toBe(first.key);
        expect((await provider.listSnapshots(projectId)).length).toBe(2);

        await cleanup(projectId);
    });

    it("still writes a manual save of an unchanged document", async () => {
        const projectId = await seedLocalProject("Named anyway");
        const provider = await getStorageProvider();

        await writeAutoSnapshot(projectId);
        // The user clicked Save: a named marker is new information even when the
        // bytes are identical, so this must appear in the history.
        const named = await writeManualSnapshot(projectId, "Act one done");

        const all = await provider.listSnapshots(projectId);
        expect(all.length).toBe(2);
        expect(all.find((s) => s.key === named.key)?.name).toBe("Act one done");

        await cleanup(projectId);
    });

    it("adds no pre-restore snapshot when the history already ends with that state", async () => {
        const projectId = await seedLocalProject("Quiet");
        const target = await writeManualSnapshot(projectId, "v1");
        await setStoredTitle(projectId, "Edited");

        // The scheduler has just captured the current state, so restoring now
        // has nothing left to back up — the unconditional pre-restore write is
        // exactly the caller the skip exists for.
        await writeAutoSnapshot(projectId);
        const before = await localSavesProvider.list(projectId);
        expect(before.length).toBe(2);

        await applyLocalSnapshotRestore(projectId, target.key);

        expect((await localSavesProvider.list(projectId)).length).toBe(2);
        expect(await storedTitle(projectId)).toBe("Quiet");

        await cleanup(projectId);
    });
});

describe("local snapshot pruning", () => {
    it("expires old auto-saves but never manual ones", async () => {
        const projectId = await seedLocalProject("Pruning");
        const provider = await getStorageProvider();

        // Two auto-saves in the same long-past day (the daily tier keeps one) and
        // a manual save older than the 30-day cutoff, which is past every tier.
        const ancient = Date.now() - 45 * RETENTION_DAY_MS;
        const body = new Uint8Array([1, 2, 3]).buffer as ArrayBuffer;
        await provider.putSnapshot(
            { key: "old-auto-1", projectId, type: "auto", createdAt: ancient, size: 3, contentHash: "h1", assetHashes: [] },
            body,
        );
        await provider.putSnapshot(
            { key: "old-auto-2", projectId, type: "auto", createdAt: ancient + 1000, size: 3, contentHash: "h2", assetHashes: [] },
            body,
        );
        await provider.putSnapshot(
            {
                key: "old-manual",
                projectId,
                type: "manual",
                name: "Keep me",
                createdAt: ancient,
                size: 3,
                contentHash: "h3",
                assetHashes: [],
            },
            body,
        );

        await pruneLocalSnapshots(projectId);

        const survivors = (await provider.listSnapshots(projectId)).map((s) => s.key);
        expect(survivors).toEqual(["old-manual"]);

        await cleanup(projectId);
    });

    it("trims the history down to the byte budget", async () => {
        const projectId = await seedLocalProject("Budget");
        const provider = await getStorageProvider();

        // Three recent auto-saves the tiers would all keep, each 60% of the
        // budget: only the newest can survive.
        const chunk = Math.floor(LOCAL_SNAPSHOT_BUDGET_BYTES * 0.6);
        const body = new Uint8Array([1]).buffer as ArrayBuffer;
        for (const [i, key] of ["a", "b", "c"].entries()) {
            await provider.putSnapshot(
                { key, projectId, type: "auto", createdAt: Date.now() - (3 - i) * 60_000, size: chunk, contentHash: key, assetHashes: [] },
                body,
            );
        }

        await pruneLocalSnapshots(projectId);
        expect((await provider.listSnapshots(projectId)).map((s) => s.key)).toEqual(["c"]);

        await cleanup(projectId);
    });
});

describe("local history on a project that becomes cloud-synced", () => {
    it("discards the history and unpins the assets it was keeping alive", async () => {
        const projectId = await seedLocalProject("Promoted");
        const provider = await getStorageProvider();

        // An asset no board card references any more: only the snapshot's
        // recorded hashes are keeping it out of the collector's hands.
        await provider.putAsset({
            key: `${projectId}/pinned`,
            projectId,
            hash: "pinned",
            mime: "image/png",
            size: 3,
            width: 1,
            height: 1,
            data: new TextEncoder().encode("abc").buffer as ArrayBuffer,
            createdAt: Date.now(),
        });
        await provider.putSnapshot(
            {
                key: `${projectId}/manual/pinning`,
                projectId,
                type: "manual",
                name: "Holds the asset",
                createdAt: Date.now(),
                size: 3,
                contentHash: "pinning",
                assetHashes: ["pinned"],
            },
            new Uint8Array([1]).buffer as ArrayBuffer,
        );

        // Promotion flips this flag, which is what makes the local pruner stop
        // running for the project — so nothing but the discard collects these.
        await markCachedProjectAsSynced(projectId);
        await discardLocalSnapshots(projectId);

        expect(await provider.listSnapshots(projectId)).toEqual([]);
        expect(await provider.listAssetHashes(projectId)).toEqual([]);

        await cleanup(projectId);
    });

    it("costs a cloud project with no history nothing but a lookup", async () => {
        const projectId = await seedLocalProject("Never had one");
        await markCachedProjectAsSynced(projectId);
        await discardLocalSnapshots(projectId); // must not throw
        expect(await (await getStorageProvider()).listSnapshots(projectId)).toEqual([]);
        await cleanup(projectId);
    });
});

describe("local snapshot restore", () => {
    it("replaces the document and snapshots the state it replaced", async () => {
        const projectId = await seedLocalProject("Original");

        const saved = await writeManualSnapshot(projectId, "Before the rewrite");
        await setStoredTitle(projectId, "Rewritten");
        expect(await storedTitle(projectId)).toBe("Rewritten");

        await applyLocalSnapshotRestore(projectId, saved.key);

        // The document is the one the snapshot held...
        expect(await storedTitle(projectId)).toBe("Original");

        // ...and the version it replaced is itself in the history, so a restore
        // the user regrets is undoable — the local stand-in for the cloud's
        // server-side copy of the live doc.
        const history = await localSavesProvider.list(projectId);
        const preRestore = history.filter((s) => s.type === "auto");
        expect(preRestore.length).toBe(1);

        const data = await (await getStorageProvider()).getSnapshotData(preRestore[0].key);
        const rebuilt = new ProjectState();
        Y.applyUpdate(rebuilt, new Uint8Array(data!));
        expect(rebuilt.metadata().get("title")).toBe("Rewritten");
        rebuilt.destroy();

        await cleanup(projectId);
    });

    it("rejects a key with no stored bytes", async () => {
        const projectId = await seedLocalProject("Missing");
        await expect(applyLocalSnapshotRestore(projectId, `${projectId}/auto/nope`)).rejects.toThrow(
            /Snapshot not found/,
        );
        await cleanup(projectId);
    });
});
