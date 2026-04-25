import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { ProjectState } from "@src/lib/project/project-state";
import { migrateProjectDoc } from "@src/lib/project/migrations/project-migration-runner";
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
