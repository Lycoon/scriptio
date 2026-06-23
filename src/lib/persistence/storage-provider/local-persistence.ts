/**
 * Cached projects persistence facade.
 * Delegates to the IndexedDB StorageProvider on all platforms.
 */

import type { UserSettings } from "@src/lib/utils/types";
import { getStorageProvider, type CachedProject, type ProjectEntryInput } from "./storage-provider";
import { yjsDbKey } from "../y-local-provider";

export type { CachedProject };

// ── Public API ────────────────────────────────────────────────────────────────

export function generateCachedProjectId(): string {
    return crypto.randomUUID();
}

export async function createCachedProject(title: string, description?: string, author?: string): Promise<CachedProject> {
    const id = generateCachedProjectId();
    const provider = await getStorageProvider();
    await provider.createProject(id, title, description, false, author);
    return (await provider.get(id))!;
}

export async function createCachedProjectWithId(
    id: string,
    title: string,
    description?: string,
    synced: boolean = false,
    author?: string,
): Promise<CachedProject> {
    const provider = await getStorageProvider();
    await provider.createProject(id, title, description, synced, author);
    return (await provider.get(id))!;
}

export async function getCachedProjects(): Promise<CachedProject[]> {
    return (await getStorageProvider()).getAll();
}

export async function getCachedProject(id: string): Promise<CachedProject | null> {
    return (await getStorageProvider()).get(id);
}

export async function updateCachedProject(
    id: string,
    updates: { title?: string; description?: string; author?: string },
): Promise<void> {
    return (await getStorageProvider()).update(id, updates);
}

export async function markCachedProjectAsSynced(id: string): Promise<void> {
    return (await getStorageProvider()).markAsSynced(id);
}

export async function touchCachedProject(id: string): Promise<void> {
    return (await getStorageProvider()).touch(id);
}

export async function deleteCachedProject(id: string): Promise<void> {
    const provider = await getStorageProvider();
    await provider.delete(id);
    // Reclaim the project's binary assets (board images). This is the chokepoint
    // every deletion flow funnels through (DangerZone + discardCloudProjectData).
    await provider.deleteProjectAssets(id);
}

export async function isCachedProject(projectId: string): Promise<boolean> {
    return cachedProjectExists(projectId);
}

export async function isLocalOnlyProject(id: string): Promise<boolean> {
    return (await getStorageProvider()).get(id).then((p) => p?.isLocalOnly ?? false);
}

/** True only when a project is cached AND synced to the cloud (i.e. not
 *  local-only). An unknown/uncached project is treated as not cloud-synced, so
 *  asset code never fires network requests for it. */
export async function isCloudSyncedProject(id: string): Promise<boolean> {
    const project = await (await getStorageProvider()).get(id);
    return project ? !project.isLocalOnly : false;
}

export async function cachedProjectExists(id: string): Promise<boolean> {
    return (await getStorageProvider()).exists(id);
}

export async function ensureCachedEntries(projects: ProjectEntryInput[]): Promise<void> {
    if (projects.length === 0) return;
    return (await getStorageProvider()).ensureEntries(projects);
}

// ── Settings persistence ──────────────────────────────────────────────────────

export async function getPersistedSettings(): Promise<Partial<UserSettings>> {
    return (await getStorageProvider()).getSettings();
}

export async function persistSettings(updates: Partial<UserSettings>): Promise<void> {
    return (await getStorageProvider()).saveSettings(updates);
}

// ── Project migration / discard ──────────────────────────────────────────────

/**
 * Migrate a cloud project to a new local-only project.
 * Creates a new cached entry and copies the Yjs document from the old
 * IndexedDB database (`scriptio-<oldId>`) to a new one (`scriptio-<newId>`).
 */
export async function migrateToCachedProject(
    oldProjectId: string,
    title: string,
    description?: string,
): Promise<CachedProject> {
    const { Doc, applyUpdate, encodeStateAsUpdate } = await import("yjs");
    const { IndexeddbPersistence } = await import("y-indexeddb");

    // 1. Load the old project's Yjs document from IndexedDB
    const oldDoc = new Doc();
    const oldProvider = new IndexeddbPersistence(yjsDbKey(oldProjectId), oldDoc);
    await new Promise<void>((resolve) => oldProvider.on("synced", () => resolve()));

    const snapshot = encodeStateAsUpdate(oldDoc);
    oldProvider.destroy();
    oldDoc.destroy();

    // 2. Create a new local-only cached project entry
    const newProject = await createCachedProject(title, description);

    // 3. Write the snapshot into the new project's IndexedDB
    const newDoc = new Doc();
    applyUpdate(newDoc, snapshot);
    const newProvider = new IndexeddbPersistence(yjsDbKey(newProject.id), newDoc);
    await new Promise<void>((resolve) => newProvider.on("synced", () => resolve()));
    await new Promise((resolve) => setTimeout(resolve, 100));
    newProvider.destroy();
    newDoc.destroy();

    // 3b. Copy the project's binary assets to the new id (they are keyed by
    // projectId, so the copied board cards would otherwise reference nothing).
    await (await getStorageProvider()).copyProjectAssets(oldProjectId, newProject.id);

    // 4. Clean up old project data
    await discardCloudProjectData(oldProjectId);

    return newProject;
}

/**
 * Promote a local-only cached project to a cloud project, reusing the same id.
 * Creates a cloud project record + membership, then flips the local cache flag.
 * The Y.js doc at `scriptio-{projectId}` is unchanged — the cloud provider in
 * `useProjectYjs` will push it to the empty server doc on next mount via the
 * standard CRDT handshake.
 */
export async function promoteLocalProjectToCloud(projectId: string): Promise<void> {
    const local = await getCachedProject(projectId);
    if (!local) throw new Error("Project not found in local cache");
    if (!local.isLocalOnly) return;

    // Gather the project's local assets and pre-check the owner's quota before we
    // create anything in the cloud, so we can fail cleanly if there's no room.
    const provider = await getStorageProvider();
    const hashes = await provider.listAssetHashes(projectId);
    const assets = (await Promise.all(hashes.map((h) => provider.getAsset(projectId, h)))).filter(
        (a): a is NonNullable<typeof a> => a !== null,
    );

    if (assets.length > 0) {
        const { fetchMyStorage } = await import("@src/lib/assets/cloud-asset-sync");
        const storage = await fetchMyStorage();
        const totalSize = assets.reduce((sum, a) => sum + a.size, 0);
        if (storage && storage.used + totalSize > storage.quota) {
            throw new Error("Uploading this project would exceed your storage limit.");
        }
    }

    const { uploadProjectToCloud } = await import("@src/lib/utils/requests");
    const res = await uploadProjectToCloud(projectId, {
        title: local.title,
        description: local.description ?? undefined,
        author: local.author ?? undefined,
    });
    if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(json.message ?? `Upload failed (${res.status})`);
    }
    await markCachedProjectAsSynced(projectId);

    // Push existing board assets to R2 now that the cloud project exists. A quota
    // error aborts (pre-check should make this rare); other per-asset failures are
    // logged so promotion still completes.
    const { uploadAssetToCloud, CloudQuotaError } = await import("@src/lib/assets/cloud-asset-sync");
    for (const asset of assets) {
        try {
            await uploadAssetToCloud(projectId, asset);
        } catch (e) {
            if (e instanceof CloudQuotaError) throw e;
            console.warn("[assets] failed to upload asset on cloud promotion:", e);
        }
    }
}

/**
 * Delete the Yjs IndexedDB database for a project without touching its metadata.
 * Used when the server restores a snapshot so the next load syncs a clean state.
 */
export async function clearYjsData(projectId: string): Promise<void> {
    const dbName = yjsDbKey(projectId);
    await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(dbName);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve(); // best-effort
        req.onblocked = () => resolve();
    });
}

/**
 * Discard a cloud project's local data (cached entry + Yjs IndexedDB database).
 */
export async function discardCloudProjectData(projectId: string): Promise<void> {
    await deleteCachedProject(projectId);
    await clearYjsData(projectId);
}
