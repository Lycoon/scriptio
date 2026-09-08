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
    POSTERS: "posters",
    SNAPSHOTS: "snapshots",
    SNAPSHOT_DATA: "snapshot_data",
} as const;

/** Index on the `assets` store used to list/delete every asset of a project. */
export const ASSETS_BY_PROJECT_INDEX = "byProject";

/** Index on the `snapshots` store used to list/delete a project's history. */
export const SNAPSHOTS_BY_PROJECT_INDEX = "byProject";

/**
 * v0 → v1: baseline. Creates the original stores, including the binary
 * `assets` store (board image resources, content-addressed by SHA-256, keyed
 * `${projectId}/${hash}` with a `byProject` index) and the two snapshot stores
 * behind device-local version history. The app isn't released yet, so these are
 * folded into the baseline rather than separate migration steps — existing local
 * databases should just be reset.
 *
 * Snapshot metadata and snapshot bytes are separate stores on purpose. Listing
 * the history and reconciling assets against it both read every row's metadata,
 * and IndexedDB structured-clones a whole record on read — with the update
 * buffer in the same row those passes would decode the entire history to answer
 * a question about its index.
 */
const baselineV1: StoreMigration = {
    from: 0,
    to: 1,
    description: "Baseline: create cached_projects, settings, dictionaries, assets, snapshots",
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
        if (!db.objectStoreNames.contains(STORE_NAMES.SNAPSHOTS)) {
            const snapshots = db.createObjectStore(STORE_NAMES.SNAPSHOTS, { keyPath: "key" });
            snapshots.createIndex(SNAPSHOTS_BY_PROJECT_INDEX, "projectId", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.SNAPSHOT_DATA)) {
            db.createObjectStore(STORE_NAMES.SNAPSHOT_DATA, { keyPath: "key" });
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

/**
 * v2 → v3: add a `posters` store. A project's poster is kept locally (keyed by
 * projectId, one per project) so local-only projects can have one at all and
 * cloud projects still render theirs offline. Not content-addressed like
 * `assets`: a poster is replaced in place, so the project id is the key.
 */
const addPostersStore: StoreMigration = {
    from: 2,
    to: 3,
    description: "Add posters store for local-first project posters",
    run: (db) => {
        if (!db.objectStoreNames.contains(STORE_NAMES.POSTERS)) {
            db.createObjectStore(STORE_NAMES.POSTERS, { keyPath: "projectId" });
        }
    },
};

export const STORE_MIGRATIONS: StoreMigration[] = [
    baselineV1,
    addMigrationBackupsStore,
    addPostersStore,
];

export const CURRENT_STORE_VERSION =
    STORE_MIGRATIONS.length === 0 ? 1 : STORE_MIGRATIONS[STORE_MIGRATIONS.length - 1].to;
