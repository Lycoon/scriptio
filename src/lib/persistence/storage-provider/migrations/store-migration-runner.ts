/**
 * Walks the StoreMigration registry inside an IndexedDB versionchange
 * transaction. Called from `onupgradeneeded`.
 */

import { StoreMigrationFailedError } from "./errors";
import { STORE_MIGRATIONS, type StoreMigration } from "./store-migrations";

export interface RunStoreMigrationsArgs {
    db: IDBDatabase;
    tx: IDBTransaction;
    oldVersion: number;
    newVersion: number;
    migrations?: StoreMigration[];
}

/**
 * Apply every migration whose `from >= oldVersion && to <= newVersion`,
 * in order. The IDB transaction is shared with the caller — if any step
 * throws, the browser aborts the transaction automatically and the on-disk
 * schema is left at `oldVersion`.
 */
export function runStoreMigrations({
    db,
    tx,
    oldVersion,
    newVersion,
    migrations = STORE_MIGRATIONS,
}: RunStoreMigrationsArgs): void {
    const steps = migrations
        .filter((m) => m.from >= oldVersion && m.to <= newVersion)
        .sort((a, b) => a.from - b.from);

    for (const step of steps) {
        try {
            step.run(db, tx);
        } catch (cause) {
            throw new StoreMigrationFailedError(step.from, step.to, cause);
        }
    }
}
