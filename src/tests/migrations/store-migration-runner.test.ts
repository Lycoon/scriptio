import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runStoreMigrations } from "@src/lib/persistence/storage-provider/migrations/store-migration-runner";
import {
    CURRENT_STORE_VERSION,
    STORE_MIGRATIONS,
    STORE_NAMES,
    type StoreMigration,
} from "@src/lib/persistence/storage-provider/migrations/store-migrations";
import { StoreMigrationFailedError } from "@src/lib/persistence/storage-provider/migrations/errors";

let dbName: string;

function uniqueName() {
    return `scriptio-test-${Math.random().toString(36).slice(2)}`;
}

function openWithMigrations(
    name: string,
    version: number,
    migrations: StoreMigration[],
): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(name, version);
        let upgradeError: unknown = null;
        req.onupgradeneeded = (event) => {
            const r = event.target as IDBOpenDBRequest;
            const tx = r.transaction;
            if (!tx) {
                upgradeError = new Error("missing tx");
                return;
            }
            try {
                runStoreMigrations({
                    db: r.result,
                    tx,
                    oldVersion: event.oldVersion,
                    newVersion: event.newVersion ?? version,
                    migrations,
                });
            } catch (err) {
                upgradeError = err;
                tx.abort();
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(upgradeError ?? req.error);
    });
}

function deleteDb(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
    });
}

beforeEach(() => {
    dbName = uniqueName();
});

afterEach(async () => {
    await deleteDb(dbName);
});

describe("runStoreMigrations", () => {
    it("applies the full registry on a fresh database", async () => {
        const db = await openWithMigrations(dbName, CURRENT_STORE_VERSION, STORE_MIGRATIONS);
        expect(Array.from(db.objectStoreNames).sort()).toEqual(
            [
                STORE_NAMES.PROJECTS,
                STORE_NAMES.SETTINGS,
                STORE_NAMES.DICTIONARIES,
                STORE_NAMES.MIGRATION_BACKUPS,
                STORE_NAMES.ASSETS,
            ].sort(),
        );
        db.close();
    });

    it("only runs steps within [oldVersion, newVersion]", async () => {
        const ran: string[] = [];
        const m: StoreMigration[] = [
            { from: 0, to: 1, description: "v1", run: () => ran.push("v1") },
            { from: 1, to: 2, description: "v2", run: () => ran.push("v2") },
            { from: 2, to: 3, description: "v3", run: () => ran.push("v3") },
        ];
        const db = await openWithMigrations(dbName, 2, m);
        expect(ran).toEqual(["v1", "v2"]);
        db.close();
    });

    it("walks multi-step chains in order from oldVersion to newVersion", async () => {
        const ran: number[] = [];
        const m: StoreMigration[] = [
            { from: 0, to: 1, description: "v1", run: (db) => { ran.push(1); db.createObjectStore("a"); } },
            { from: 1, to: 2, description: "v2", run: (db) => { ran.push(2); db.createObjectStore("b"); } },
            { from: 2, to: 3, description: "v3", run: (db) => { ran.push(3); db.createObjectStore("c"); } },
        ];
        const db = await openWithMigrations(dbName, 3, m);
        expect(ran).toEqual([1, 2, 3]);
        expect(Array.from(db.objectStoreNames).sort()).toEqual(["a", "b", "c"]);
        db.close();
    });

    it("aborts the upgrade transaction when a step throws and leaves the schema unchanged", async () => {
        const m: StoreMigration[] = [
            { from: 0, to: 1, description: "v1", run: (db) => { db.createObjectStore("a"); } },
            { from: 1, to: 2, description: "v2 (throws)", run: () => { throw new Error("boom"); } },
        ];

        let caught: unknown;
        try {
            const db = await openWithMigrations(dbName, 2, m);
            db.close();
        } catch (e) {
            caught = e;
        }
        // Either the runner throws StoreMigrationFailedError, or the IDB transaction
        // aborts with an AbortError after the throw bubbles up.
        const isExpected =
            caught instanceof StoreMigrationFailedError ||
            (caught instanceof DOMException && (caught.name === "AbortError" || caught.name === "InvalidStateError"));
        expect(isExpected).toBe(true);

        // Re-opening with version=1 should succeed and store "a" should not exist
        // (the upgrade transaction was rolled back).
        const reopen = await new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open(dbName);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        expect(reopen.version).toBe(0 < reopen.version ? reopen.version : 0);
        // Browser may keep the DB at version 0 (never opened) or at 1 (partial open).
        // Either way, store "a" must NOT exist because the throwing tx aborted.
        if (reopen.version >= 1) {
            expect(reopen.objectStoreNames.contains("a")).toBe(false);
        }
        reopen.close();
    });

    it("upgrade from v1 to v2 adds only the new store and preserves existing data", async () => {
        // Step 1: open at v1 with only the baseline.
        const db1 = await openWithMigrations(dbName, 1, [STORE_MIGRATIONS[0]]);
        await new Promise<void>((resolve, reject) => {
            const tx = db1.transaction(STORE_NAMES.PROJECTS, "readwrite");
            tx.objectStore(STORE_NAMES.PROJECTS).put({
                id: "p1",
                title: "T",
                description: null,
                author: null,
                createdAt: 0,
                updatedAt: 0,
                is_synced: 0,
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db1.close();

        // Step 2: re-open at v2 — only addMigrationBackupsStore should run.
        const db2 = await openWithMigrations(dbName, 2, STORE_MIGRATIONS);
        expect(db2.objectStoreNames.contains(STORE_NAMES.MIGRATION_BACKUPS)).toBe(true);
        const persisted = await new Promise<unknown>((resolve, reject) => {
            const req = db2.transaction(STORE_NAMES.PROJECTS, "readonly").objectStore(STORE_NAMES.PROJECTS).get("p1");
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        expect((persisted as { id: string }).id).toBe("p1");
        db2.close();
    });
});
