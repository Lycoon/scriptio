import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { ProjectState } from "@src/lib/project/project-state";
import {
    migrateProjectDoc,
    migrateProjectDocCore,
    readProjectDocVersion,
} from "@src/lib/project/migrations/project-migration-runner";
import type { ProjectMigration } from "@src/lib/project/migrations/project-migrations";

interface FakeBackupStore {
    saveMigrationBackup: (projectId: string, snapshot: Uint8Array, fromVersion: number) => Promise<void>;
    saved: Array<{ projectId: string; snapshot: Uint8Array; fromVersion: number }>;
}

function makeBackupStore(): FakeBackupStore {
    const saved: FakeBackupStore["saved"] = [];
    return {
        saved,
        async saveMigrationBackup(projectId, snapshot, fromVersion) {
            saved.push({ projectId, snapshot, fromVersion });
        },
    };
}


describe("migrateProjectDoc", () => {
    it("returns up-to-date and writes nothing when version equals current", async () => {
        const ydoc = new ProjectState();
        ydoc.metadata().set("version", 3);
        const before = Y.encodeStateAsUpdate(ydoc);

        const backup = makeBackupStore();
        const outcome = await migrateProjectDoc({
            ydoc,
            projectId: "p",
            backupStore: backup,
            migrations: [],
            currentVersion: 3,
        });

        expect(outcome.kind).toBe("up-to-date");
        expect(backup.saved).toHaveLength(0);

        const after = Y.encodeStateAsUpdate(ydoc);
        // No mutations: byte-identical state.
        expect(after).toEqual(before);
        ydoc.destroy();
    });

    it("treats a missing version field as legacy v1", async () => {
        const ydoc = new ProjectState();
        const backup = makeBackupStore();

        const outcome = await migrateProjectDoc({
            ydoc,
            projectId: "p",
            backupStore: backup,
            migrations: [],
            currentVersion: 1,
        });

        expect(outcome.kind).toBe("up-to-date");
        if (outcome.kind === "up-to-date") {
            expect(outcome.version).toBe(1);
        }
        ydoc.destroy();
    });

    it("blocks future-version projects without mutating", async () => {
        const ydoc = new ProjectState();
        ydoc.metadata().set("version", 99);
        const before = Y.encodeStateAsUpdate(ydoc);

        const backup = makeBackupStore();
        const outcome = await migrateProjectDoc({
            ydoc,
            projectId: "p",
            backupStore: backup,
            migrations: [],
            currentVersion: 2,
        });

        expect(outcome.kind).toBe("future-version");
        if (outcome.kind === "future-version") {
            expect(outcome.storedVersion).toBe(99);
            expect(outcome.expected).toBe(2);
        }
        expect(backup.saved).toHaveLength(0);
        expect(Y.encodeStateAsUpdate(ydoc)).toEqual(before);
        ydoc.destroy();
    });

    it("applies a chain of steps in order and bumps version atomically", async () => {
        const ydoc = new ProjectState();
        // Stored version = 1 (legacy default).
        const ran: string[] = [];
        const migrations: ProjectMigration[] = [
            {
                from: 1,
                to: 2,
                description: "bump-author",
                run: (doc) => {
                    ran.push("v2");
                    doc.metadata().set("author", "migrated-author");
                },
            },
            {
                from: 2,
                to: 3,
                description: "bump-title",
                run: (doc) => {
                    ran.push("v3");
                    doc.metadata().set("title", "migrated-title");
                },
            },
        ];

        const outcome = await migrateProjectDoc({
            ydoc,
            projectId: "p",
            backupStore: makeBackupStore(),
            migrations,
            currentVersion: 3,
        });

        expect(outcome.kind).toBe("migrated");
        if (outcome.kind === "migrated") {
            expect(outcome.from).toBe(1);
            expect(outcome.to).toBe(3);
            expect(outcome.appliedSteps).toEqual(["bump-author", "bump-title"]);
        }
        expect(ran).toEqual(["v2", "v3"]);
        expect(ydoc.metadata().get("version")).toBe(3);
        expect(ydoc.metadata().get("author")).toBe("migrated-author");
        expect(ydoc.metadata().get("title")).toBe("migrated-title");
        ydoc.destroy();
    });

    it("saves a pre-migration backup before mutating", async () => {
        const ydoc = new ProjectState();
        ydoc.metadata().set("title", "before");
        const beforeSnapshot = Y.encodeStateAsUpdate(ydoc);

        const backup = makeBackupStore();
        const migrations: ProjectMigration[] = [
            {
                from: 1,
                to: 2,
                description: "rewrite",
                run: (doc) => doc.metadata().set("title", "after"),
            },
        ];

        await migrateProjectDoc({
            ydoc,
            projectId: "proj-42",
            backupStore: backup,
            migrations,
            currentVersion: 2,
        });

        expect(backup.saved).toHaveLength(1);
        expect(backup.saved[0].projectId).toBe("proj-42");
        expect(backup.saved[0].fromVersion).toBe(1);
        expect(backup.saved[0].snapshot).toEqual(beforeSnapshot);
        ydoc.destroy();
    });

    it("returns failed and does not advance version when a step throws", async () => {
        const ydoc = new ProjectState();
        ydoc.metadata().set("title", "T");

        const migrations: ProjectMigration[] = [
            { from: 1, to: 2, description: "ok", run: (doc) => doc.metadata().set("author", "A") },
            { from: 2, to: 3, description: "bad", run: () => { throw new Error("boom"); } },
        ];

        const outcome = await migrateProjectDoc({
            ydoc,
            projectId: "p",
            backupStore: makeBackupStore(),
            migrations,
            currentVersion: 3,
        });

        expect(outcome.kind).toBe("failed");
        if (outcome.kind === "failed") {
            expect(outcome.from).toBe(1);
            expect(outcome.failedAt).toBe(3);
            expect(outcome.error.message).toBe("boom");
        }
        // Step 1 ran (its mutation is visible) but version was NOT advanced.
        expect(ydoc.metadata().get("author")).toBe("A");
        expect(ydoc.metadata().get("version")).toBeUndefined();
        ydoc.destroy();
    });

    it("running the same migration chain twice is idempotent", async () => {
        const ydoc = new ProjectState();
        const migrations: ProjectMigration[] = [
            {
                from: 1,
                to: 2,
                description: "set-flag",
                run: (doc) => doc.metadata().set("titlepageInitialized", true),
            },
        ];

        await migrateProjectDoc({
            ydoc,
            projectId: "p",
            backupStore: makeBackupStore(),
            migrations,
            currentVersion: 2,
        });
        const stateAfterFirst = Y.encodeStateAsUpdate(ydoc);

        // Second invocation: stored is now 2, equals current → up-to-date, no writes.
        const outcome = await migrateProjectDoc({
            ydoc,
            projectId: "p",
            backupStore: makeBackupStore(),
            migrations,
            currentVersion: 2,
        });
        expect(outcome.kind).toBe("up-to-date");
        expect(Y.encodeStateAsUpdate(ydoc)).toEqual(stateAfterFirst);
        ydoc.destroy();
    });
});

describe("migrateProjectDocCore", () => {
    /** Idempotent migration that only sets keys (the contract from project-migrations.ts). */
    const setAuthor: ProjectMigration = {
        from: 1,
        to: 2,
        description: "set-author",
        run: (doc) => doc.metadata().set("author", "v2-author"),
    };

    it("runs without a backup store (DO-style invocation)", async () => {
        const ydoc = new ProjectState();
        const outcome = await migrateProjectDocCore({
            ydoc,
            migrations: [setAuthor],
            currentVersion: 2,
        });
        expect(outcome.kind).toBe("migrated");
        expect(ydoc.metadata().get("version")).toBe(2);
        expect(ydoc.metadata().get("author")).toBe("v2-author");
        ydoc.destroy();
    });

    it("invokes onBeforeMutate exactly once with the pre-mutation snapshot", async () => {
        const ydoc = new ProjectState();
        ydoc.metadata().set("title", "T");
        const beforeBytes = Y.encodeStateAsUpdate(ydoc);

        const calls: Array<{ snapshot: Uint8Array; fromVersion: number }> = [];
        await migrateProjectDocCore({
            ydoc,
            migrations: [setAuthor],
            currentVersion: 2,
            onBeforeMutate: async (snapshot, fromVersion) => {
                calls.push({ snapshot, fromVersion });
            },
        });

        expect(calls).toHaveLength(1);
        expect(calls[0].fromVersion).toBe(1);
        expect(calls[0].snapshot).toEqual(beforeBytes);
        ydoc.destroy();
    });

    it("does NOT call onBeforeMutate when there's nothing to do (no steps, version-only bump)", async () => {
        const ydoc = new ProjectState();
        // No registered migrations — the runner just brings the version field forward.
        let called = false;
        await migrateProjectDocCore({
            ydoc,
            migrations: [],
            currentVersion: 5,
            onBeforeMutate: async () => {
                called = true;
            },
        });
        expect(called).toBe(false);
        expect(ydoc.metadata().get("version")).toBe(5);
        ydoc.destroy();
    });
});

describe("multi-source migration convergence", () => {
    /**
     * Simulates the gatekeeper-on-both-sides architecture: the DurableObject
     * migrates its in-memory doc; the client also migrates its local cache;
     * they exchange Y.js updates and must converge to the same shape.
     */
    it("client and server independently migrate then sync to identical state", async () => {
        const migrations: ProjectMigration[] = [
            {
                from: 1,
                to: 2,
                description: "set-author",
                run: (doc) => doc.metadata().set("author", "post-migration"),
            },
        ];

        // Server side: starts at v1 (legacy), runs migration.
        const server = new ProjectState();
        server.metadata().set("title", "shared-title");
        await migrateProjectDocCore({ ydoc: server, migrations, currentVersion: 2 });

        // Client side: cold cache (empty), runs migration on empty doc, then
        // applies the server's update (the race we're closing).
        const client = new ProjectState();
        await migrateProjectDocCore({ ydoc: client, migrations, currentVersion: 2 });
        Y.applyUpdate(client, Y.encodeStateAsUpdate(server));

        // Both must converge to v2 with author + title set.
        expect(client.metadata().get("version")).toBe(2);
        expect(client.metadata().get("author")).toBe("post-migration");
        expect(client.metadata().get("title")).toBe("shared-title");

        // Reverse direction also converges — round-trip the client's state to server.
        Y.applyUpdate(server, Y.encodeStateAsUpdate(client));
        expect(server.metadata().get("version")).toBe(2);
        expect(server.metadata().get("author")).toBe("post-migration");
        server.destroy();
        client.destroy();
    });

    it("re-migrates when an old-version update arrives after migration", async () => {
        const migrations: ProjectMigration[] = [
            {
                from: 1,
                to: 2,
                description: "init-author",
                // Idempotent: only sets if missing.
                run: (doc) => {
                    if (!doc.metadata().has("author")) doc.metadata().set("author", "default");
                },
            },
        ];

        // Doc A starts at v1 with content, never migrated.
        const oldDoc = new ProjectState();
        oldDoc.metadata().set("title", "from-old-client");
        const oldUpdate = Y.encodeStateAsUpdate(oldDoc);

        // Doc B migrates fresh.
        const migrated = new ProjectState();
        await migrateProjectDocCore({ ydoc: migrated, migrations, currentVersion: 2 });
        // Now an old-version update arrives (e.g., from a client that bypassed the gate).
        Y.applyUpdate(migrated, oldUpdate);

        // The doc still has version=2 (LWW with a newer clock) and the title.
        expect(migrated.metadata().get("version")).toBe(2);
        expect(migrated.metadata().get("title")).toBe("from-old-client");
        // Re-running migration is a no-op (already at v2).
        const second = await migrateProjectDocCore({ ydoc: migrated, migrations, currentVersion: 2 });
        expect(second.kind).toBe("up-to-date");
        oldDoc.destroy();
        migrated.destroy();
    });
});

describe("readProjectDocVersion", () => {
    it("returns 1 when no version field is set", () => {
        const ydoc = new Y.Doc();
        expect(readProjectDocVersion(ydoc)).toBe(1);
        ydoc.destroy();
    });

    it("returns the stored version when set", () => {
        const ydoc = new Y.Doc();
        ydoc.getMap("metadata").set("version", 7);
        expect(readProjectDocVersion(ydoc)).toBe(7);
        ydoc.destroy();
    });
});
