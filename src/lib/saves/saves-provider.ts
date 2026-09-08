/**
 * Where a project's version history lives, and how to reach it.
 *
 * The two implementations behind this are not variations on one storage layer —
 * one is an authenticated round trip to a Worker holding R2 objects, the other
 * is IndexedDB on this device — so the seam is drawn at the five operations the
 * panel actually performs rather than anywhere lower down. It follows the
 * pattern the rest of the local-first code uses (`asset-store`, `poster-store`,
 * `asset-gc`): a small guard at each seam, no central adapter.
 */

import { isCloudSyncedProject } from "../persistence/storage-provider/local-persistence";
import type { SaveEntry } from "./types";

export interface SavesProvider {
    list(projectId: string): Promise<SaveEntry[]>;
    createManual(projectId: string, name: string): Promise<SaveEntry | null>;
    restore(projectId: string, key: string): Promise<void>;
    renameManual(projectId: string, key: string, name: string): Promise<void>;
    remove(projectId: string, key: string): Promise<void>;
}

/**
 * History follows the project's storage target: cloud-synced projects get the
 * cloud history, everything else the device-local one.
 *
 * The question is deliberately `isCloudSyncedProject` and not the membership or
 * Pro flags the panel already has. A cloud project opened offline has no
 * membership to read, and answering "local" there would show the user an empty
 * history for a project whose versions are sitting in R2 — and then write local
 * snapshots beside them that no other device would ever see.
 */
export async function getSavesProvider(projectId: string): Promise<SavesProvider> {
    if (await isCloudSyncedProject(projectId)) {
        const { cloudSavesProvider } = await import("./cloud-saves-provider");
        return cloudSavesProvider;
    }
    const { localSavesProvider } = await import("./local-saves-provider");
    return localSavesProvider;
}
