/**
 * Drives `PROJECT_MIGRATIONS` against a single `ProjectState`.
 *
 * Two entry points:
 *   - `migrateProjectDocCore`: pure migration with no I/O. Used by the
 *     DurableObject (server-side gatekeeper) to migrate the doc on load
 *     before serving updates to clients.
 *   - `migrateProjectDoc`: client wrapper that adds an IndexedDB pre-migration
 *     backup so a failed step can be rolled back. Called from
 *     `useLocalPersistence` after `y-indexeddb` has synced and before the
 *     cloud `WebsocketProvider` connects.
 *
 * Both rely on idempotent migration steps so concurrent migrations across
 * the DO and any number of clients converge cleanly under CRDT merge.
 */

import * as Y from "yjs";
import { ProjectState } from "../project-doc";
import {
    CURRENT_PROJECT_VERSION,
    PROJECT_MIGRATIONS,
    type ProjectMigration,
} from "./project-migrations";

export type ProjectMigrationOutcome =
    | { kind: "up-to-date"; version: number }
    | { kind: "migrated"; from: number; to: number; appliedSteps: string[] }
    | { kind: "future-version"; storedVersion: number; expected: number }
    | { kind: "failed"; from: number; failedAt: number; error: Error }
    /**
     * Surfaced by the layout when the cloud server rejects the WebSocket
     * upgrade because this client's bundle predates the doc's schema version.
     * Not produced by the migration runner itself — it's a UI-side outcome
     * routed through the same error dialog.
     */
    | { kind: "stale-client" };

const MIGRATION_ORIGIN = "migration";

interface BackupStore {
    saveMigrationBackup(projectId: string, snapshot: Uint8Array, fromVersion: number): Promise<void>;
}

export interface MigrateProjectDocCoreArgs {
    ydoc: ProjectState;
    /** Override for tests; defaults to `PROJECT_MIGRATIONS`. */
    migrations?: ProjectMigration[];
    /** Override for tests; defaults to `CURRENT_PROJECT_VERSION`. */
    currentVersion?: number;
    /**
     * Optional async hook invoked once we know migration steps will run, with
     * the pre-mutation snapshot. The client uses this to persist a rollback
     * backup; the DO leaves it unset.
     */
    onBeforeMutate?: (snapshot: Uint8Array, fromVersion: number) => Promise<void>;
}

export interface MigrateProjectDocArgs {
    ydoc: ProjectState;
    projectId: string;
    /** Override for tests; defaults to `getStorageProvider()`. */
    backupStore?: BackupStore;
    /** Override for tests; defaults to `PROJECT_MIGRATIONS`. */
    migrations?: ProjectMigration[];
    /** Override for tests; defaults to `CURRENT_PROJECT_VERSION`. */
    currentVersion?: number;
}

async function defaultBackupStore(): Promise<BackupStore> {
    const { getStorageProvider } = await import("../../persistence/storage-provider/storage-provider");
    return getStorageProvider();
}

function readVersion(ydoc: ProjectState): number {
    const stored = ydoc.metadata().get("version");
    return typeof stored === "number" ? stored : 1;
}

/**
 * Public helper: peek the version field of a project doc without mutating it.
 * Accepts a raw `Y.Doc` so callers that don't carry the `ProjectState` typing
 * (e.g. examining a freshly-applied snapshot before constructing one) can use it.
 */
export function readProjectDocVersion(ydoc: Y.Doc): number {
    const stored = ydoc.getMap("metadata").get("version");
    return typeof stored === "number" ? stored : 1;
}

/**
 * Pure migration: no I/O, safe to call from any environment (browser, DO).
 */
export async function migrateProjectDocCore({
    ydoc,
    migrations = PROJECT_MIGRATIONS,
    currentVersion = CURRENT_PROJECT_VERSION,
    onBeforeMutate,
}: MigrateProjectDocCoreArgs): Promise<ProjectMigrationOutcome> {
    const stored = readVersion(ydoc);

    if (stored === currentVersion) {
        return { kind: "up-to-date", version: stored };
    }
    if (stored > currentVersion) {
        return { kind: "future-version", storedVersion: stored, expected: currentVersion };
    }

    const steps = migrations
        .filter((m) => m.from >= stored && m.to <= currentVersion)
        .sort((a, b) => a.from - b.from);

    if (steps.length === 0) {
        // Nothing to run, but the version field is stale — bring it forward.
        ydoc.transact(() => {
            ydoc.metadata().set("version", currentVersion);
        }, MIGRATION_ORIGIN);
        return { kind: "migrated", from: stored, to: currentVersion, appliedSteps: [] };
    }

    if (onBeforeMutate) {
        const snapshot = Y.encodeStateAsUpdate(ydoc);
        await onBeforeMutate(snapshot, stored);
    }

    const applied: string[] = [];
    for (const step of steps) {
        try {
            ydoc.transact(() => step.run(ydoc), MIGRATION_ORIGIN);
            applied.push(step.description);
        } catch (cause) {
            return {
                kind: "failed",
                from: stored,
                failedAt: step.to,
                error: cause instanceof Error ? cause : new Error(String(cause)),
            };
        }
    }

    ydoc.transact(() => {
        ydoc.metadata().set("version", currentVersion);
    }, MIGRATION_ORIGIN);

    return { kind: "migrated", from: stored, to: currentVersion, appliedSteps: applied };
}

/**
 * Client-side migration. Wraps `migrateProjectDocCore` with an IndexedDB
 * rollback backup so a failed step can be restored from the
 * `ProjectMigrationErrorDialog`.
 */
export async function migrateProjectDoc({
    ydoc,
    projectId,
    backupStore,
    migrations,
    currentVersion,
}: MigrateProjectDocArgs): Promise<ProjectMigrationOutcome> {
    return migrateProjectDocCore({
        ydoc,
        migrations,
        currentVersion,
        onBeforeMutate: async (snapshot, fromVersion) => {
            const store = backupStore ?? (await defaultBackupStore());
            await store.saveMigrationBackup(projectId, snapshot, fromVersion);
        },
    });
}

/**
 * Replay a stored backup snapshot into a fresh Y.Doc, then write that doc
 * back to local persistence. Used when the user picks "Restore from backup"
 * after a failed migration.
 */
export async function restoreProjectFromBackup(projectId: string): Promise<boolean> {
    const { getStorageProvider } = await import("../../persistence/storage-provider/storage-provider");
    const provider = await getStorageProvider();
    const backup = await provider.loadMigrationBackup(projectId);
    if (!backup) return false;

    const { yjsDbKey } = await import("../../persistence/y-local-provider");
    const { IndexeddbPersistence } = await import("y-indexeddb");

    // Wipe the current Yjs DB by clearing the existing persistence.
    const wipeDoc = new Y.Doc();
    const wipePersistence = new IndexeddbPersistence(yjsDbKey(projectId), wipeDoc);
    await new Promise<void>((resolve) => wipePersistence.on("synced", () => resolve()));
    const clearable = wipePersistence as unknown as { clearData?: () => Promise<void> };
    if (typeof clearable.clearData === "function") {
        await clearable.clearData();
    }
    wipePersistence.destroy();
    wipeDoc.destroy();

    // Replay the snapshot into a fresh doc and write it back.
    const restoredDoc = new Y.Doc();
    Y.applyUpdate(restoredDoc, backup.snapshot);
    const writePersistence = new IndexeddbPersistence(yjsDbKey(projectId), restoredDoc);
    await new Promise<void>((resolve) => writePersistence.on("synced", () => resolve()));
    await new Promise((resolve) => setTimeout(resolve, 100));
    writePersistence.destroy();
    restoredDoc.destroy();

    await provider.clearMigrationBackup(projectId);
    return true;
}
