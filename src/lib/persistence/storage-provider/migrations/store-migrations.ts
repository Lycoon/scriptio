/**
 * Registry of IndexedDB schema migrations for the app-wide `scriptio-local` database.
 *
 * Each entry is `{ from, to, run }`. `run` executes inside the IndexedDB
 * `versionchange` transaction, so it must be synchronous and only use IDB
 * operations available in upgrade transactions (createObjectStore /
 * deleteObjectStore / cursors over existing stores).
 *
 * Adding a new migration:
 *   1. Append a new step with `from = previous .to` and `to = previous.to + 1`.
 *   2. The runner derives `CURRENT_STORE_VERSION` from the last `to`.
 *   3. Existing users will run the new step on next app launch via `onupgradeneeded`.
 */

export interface StoreMigration {
    from: number;
    to: number;
    description: string;
    run: (db: IDBDatabase, tx: IDBTransaction) => void;
}

/** Object store names — kept in sync with IndexedDBStorageProvider. */
export const STORE_NAMES = {
    PROJECTS: "cached_projects",
    SETTINGS: "settings",
    DICTIONARIES: "dictionaries",
    MIGRATION_BACKUPS: "migration_backups",
    ASSETS: "assets",
} as const;

/** Index on the `assets` store used to list/delete every asset of a project. */
export const ASSETS_BY_PROJECT_INDEX = "byProject";

/**
 * v0 → v1: baseline. Creates the original stores, including the binary
 * `assets` store (board image resources, content-addressed by SHA-256, keyed
 * `${projectId}/${hash}` with a `byProject` index). The app isn't released
 * yet, so this is folded into the baseline rather than a separate migration
 * step — existing local databases should just be reset.
 */
const baselineV1: StoreMigration = {
    from: 0,
    to: 1,
    description: "Baseline: create cached_projects, settings, dictionaries, assets",
    run: (db) => {
        if (!db.objectStoreNames.contains(STORE_NAMES.PROJECTS)) {
            db.createObjectStore(STORE_NAMES.PROJECTS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.SETTINGS)) {
            db.createObjectStore(STORE_NAMES.SETTINGS);
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.DICTIONARIES)) {
            db.createObjectStore(STORE_NAMES.DICTIONARIES, { keyPath: "code" });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.ASSETS)) {
            const assets = db.createObjectStore(STORE_NAMES.ASSETS, { keyPath: "key" });
            assets.createIndex(ASSETS_BY_PROJECT_INDEX, "projectId", { unique: false });
        }
    },
};

/**
 * v1 → v2: add a `migration_backups` store. The project-doc migration runner
 * snapshots a Y.Doc here before mutating it, so a failed migration can be
 * rolled back from the backup.
 */
const addMigrationBackupsStore: StoreMigration = {
    from: 1,
    to: 2,
    description: "Add migration_backups store for project doc rollback snapshots",
    run: (db) => {
        if (!db.objectStoreNames.contains(STORE_NAMES.MIGRATION_BACKUPS)) {
            db.createObjectStore(STORE_NAMES.MIGRATION_BACKUPS, { keyPath: "projectId" });
        }
    },
};

export const STORE_MIGRATIONS: StoreMigration[] = [
    baselineV1,
    addMigrationBackupsStore,
];

export const CURRENT_STORE_VERSION =
    STORE_MIGRATIONS.length === 0 ? 1 : STORE_MIGRATIONS[STORE_MIGRATIONS.length - 1].to;
