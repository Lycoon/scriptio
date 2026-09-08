/**
 * The device-local half of {@link SavesProvider}, over the `snapshots` /
 * `snapshot_data` IndexedDB stores.
 *
 * Thin by design: the policy — when a snapshot is taken, what retention keeps,
 * what a restore has to put back — lives in `local-snapshots.ts`, so this file
 * stays a mapping from the panel's five verbs onto it.
 */

import { getStorageProvider } from "../persistence/storage-provider/storage-provider";
import {
    deleteLocalSnapshot,
    restoreLocalSnapshot,
    writeManualSnapshot,
} from "./local-snapshots";
import type { SavesProvider } from "./saves-provider";

export const localSavesProvider: SavesProvider = {
    list: async (projectId) => {
        const snapshots = await (await getStorageProvider()).listSnapshots(projectId);
        return snapshots.map((meta) => ({
            key: meta.key,
            type: meta.type,
            name: meta.name,
            date: new Date(meta.createdAt).toISOString(),
            size: meta.size,
        }));
    },
    createManual: (projectId, name) => writeManualSnapshot(projectId, name),
    restore: (projectId, key) => restoreLocalSnapshot(projectId, key),
    // A plain field update. R2 has no rename, which is why the cloud has to
    // re-put the object under a new key and carry its asset index across; a row
    // in IndexedDB just takes a new name.
    renameManual: async (projectId, key, name) => {
        await (await getStorageProvider()).renameSnapshot(key, name);
    },
    remove: (projectId, key) => deleteLocalSnapshot(projectId, key),
};
