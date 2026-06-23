/**
 * Asset store façade.
 *
 * The single chokepoint for reading/writing board image/audio bytes, decoupled
 * from the Yjs document. Assets are stored in IndexedDB content-addressed by
 * SHA-256 (so duplicates collapse) and scoped per project. For cloud-synced
 * projects this seam also mirrors the bytes to R2 (upload on import, fetch on a
 * local cache miss) via {@link ./cloud-asset-sync}.
 */

import type { ProjectState } from "../project/project-state";
import { getStorageProvider } from "../persistence/storage-provider/storage-provider";
import { sha256Hex } from "./asset-hash";
import { collectReferencedHashes } from "./asset-refs";
import type { ProjectAssetInfo } from "./cloud-asset-sync";

export type { ProjectAssetInfo };

/** Whether a project syncs to the cloud (cached and not local-only). An uncached
 *  project is treated as local, so this never fires a request for one. */
async function isCloudSynced(projectId: string): Promise<boolean> {
    const { isCloudSyncedProject } = await import("../persistence/storage-provider/local-persistence");
    return isCloudSyncedProject(projectId);
}

/**
 * Upload a locally-stored asset to R2 for a cloud-synced project. Kept separate
 * from import so the board can show the card instantly and upload in the
 * background (the bytes are already cached locally, so it renders offline). A
 * quota error propagates so the caller can roll back the card. No-op for
 * local-only projects or if the asset isn't stored locally.
 */
export async function syncAssetToCloud(projectId: string, hash: string): Promise<void> {
    if (!(await isCloudSynced(projectId))) return;
    const provider = await getStorageProvider();
    const asset = await provider.getAsset(projectId, hash);
    if (!asset) return;
    const { uploadAssetToCloud } = await import("./cloud-asset-sync");
    await uploadAssetToCloud(projectId, asset);
}

/**
 * Re-upload any document-referenced local assets the cloud is missing — e.g.
 * assets added while offline. Best-effort; intended to run on project open.
 * Only considers assets still referenced by the doc (so it never re-uploads
 * local orphans) and present locally, then asks the server which are missing.
 */
export async function pushPendingAssets(projectId: string, ydoc: ProjectState): Promise<void> {
    if (!(await isCloudSynced(projectId))) return;

    let referenced: Set<string>;
    try {
        referenced = collectReferencedHashes(ydoc);
    } catch {
        return; // malformed cards — skip this pass
    }
    if (referenced.size === 0) return;

    const provider = await getStorageProvider();
    const local = new Set(await provider.listAssetHashes(projectId));
    const candidates = [...referenced].filter((hash) => local.has(hash));
    if (candidates.length === 0) return;

    const { fetchMissingAssetHashes } = await import("./cloud-asset-sync");
    const missing = await fetchMissingAssetHashes(projectId, candidates);
    for (const hash of missing) {
        await syncAssetToCloud(projectId, hash).catch((e) =>
            console.warn("[assets] pending upload failed:", e),
        );
    }
}

export interface AssetMeta {
    /** SHA-256 hex — the assetId referenced by board cards. */
    hash: string;
    mime: string;
    width: number;
    height: number;
}

/** Read the intrinsic pixel size of an image file, with a decode fallback. */
async function decodeImageSize(file: Blob): Promise<{ width: number; height: number }> {
    if (typeof createImageBitmap === "function") {
        try {
            const bitmap = await createImageBitmap(file);
            const size = { width: bitmap.width, height: bitmap.height };
            bitmap.close();
            return size;
        } catch {
            // fall through to the <img> path
        }
    }

    const url = URL.createObjectURL(file);
    try {
        return await new Promise<{ width: number; height: number }>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => reject(new Error("Failed to decode image"));
            img.src = url;
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * Store an image file locally for a project and return its metadata. Idempotent:
 * if an asset with the same bytes already exists it is returned unchanged (dedup).
 * Local-only and instant — cloud upload is done separately (see
 * {@link syncAssetToCloud}) so the card can appear immediately and render offline.
 */
export async function importImageFile(projectId: string, file: File): Promise<AssetMeta> {
    const buffer = await file.arrayBuffer();
    const hash = await sha256Hex(buffer);
    const mime = file.type || "image/png";

    const provider = await getStorageProvider();

    const existing = await provider.getAsset(projectId, hash);
    if (existing) {
        return { hash, mime: existing.mime, width: existing.width, height: existing.height };
    }

    const { width, height } = await decodeImageSize(file);
    await provider.putAsset({
        key: `${projectId}/${hash}`,
        projectId,
        hash,
        mime,
        size: file.size,
        width,
        height,
        data: buffer,
        createdAt: Date.now(),
    });

    return { hash, mime, width, height };
}

/** The base mime type without any `;codecs=...` parameters. */
function baseMime(mime: string): string {
    return mime.split(";")[0].trim();
}

/**
 * Store an audio file (a recording or a dropped file) for a project and return
 * its metadata. Like {@link importImageFile} but audio has no intrinsic pixel
 * size, so `width`/`height` are stored as `0`. Idempotent (dedup by SHA-256).
 *
 * `mime` may be passed explicitly because recorded blobs sometimes carry a
 * `;codecs=...` suffix; it is normalized to the base type before storing.
 */
export async function importAudioFile(
    projectId: string,
    file: Blob,
    mime?: string,
): Promise<AssetMeta> {
    const buffer = await file.arrayBuffer();
    const hash = await sha256Hex(buffer);
    const resolvedMime = baseMime(mime || file.type || "audio/mp4");

    const provider = await getStorageProvider();

    const existing = await provider.getAsset(projectId, hash);
    if (existing) {
        return { hash, mime: existing.mime, width: existing.width, height: existing.height };
    }

    await provider.putAsset({
        key: `${projectId}/${hash}`,
        projectId,
        hash,
        mime: resolvedMime,
        size: file.size,
        width: 0,
        height: 0,
        data: buffer,
        createdAt: Date.now(),
    });

    return { hash, mime: resolvedMime, width: 0, height: 0 };
}

/**
 * List the assets a project's document currently references (images/audio in
 * board cards), with metadata for the Storage dashboard. Uses the local store
 * for sizes/dimensions and, for a cloud-synced project, fills in any referenced
 * asset not cached locally from the server. Works for local-only projects too.
 */
export async function listInUseAssets(projectId: string, ydoc: ProjectState): Promise<ProjectAssetInfo[]> {
    let referenced: Set<string>;
    try {
        referenced = collectReferencedHashes(ydoc);
    } catch {
        return [];
    }
    if (referenced.size === 0) return [];

    const provider = await getStorageProvider();
    const out = new Map<string, ProjectAssetInfo>();
    for (const hash of referenced) {
        const a = await provider.getAsset(projectId, hash);
        if (a) out.set(hash, { hash, mime: a.mime, size: a.size, width: a.width, height: a.height });
    }

    // Cloud project: fill in referenced assets not cached on this device.
    if (out.size < referenced.size && (await isCloudSynced(projectId))) {
        const { fetchProjectAssetInfos } = await import("./cloud-asset-sync");
        for (const info of await fetchProjectAssetInfos(projectId)) {
            if (referenced.has(info.hash) && !out.has(info.hash)) out.set(info.hash, info);
        }
    }

    return [...out.values()];
}

/**
 * Resolve an asset to an object URL for rendering. Reads the local IndexedDB
 * cache first; on a miss for a cloud-synced project it fetches the bytes from R2
 * and caches them locally before returning. Null if unavailable. Callers own the
 * URL and must `URL.revokeObjectURL` it when done.
 */
export async function loadAssetObjectUrl(projectId: string, hash: string): Promise<string | null> {
    const provider = await getStorageProvider();
    let asset = await provider.getAsset(projectId, hash);

    if (!asset && (await isCloudSynced(projectId))) {
        const { fetchAssetFromCloud } = await import("./cloud-asset-sync");
        const fetched = await fetchAssetFromCloud(projectId, hash);
        if (fetched) {
            await provider.putAsset(fetched); // cache for next time / offline
            asset = fetched;
        }
    }

    if (!asset) return null;
    return URL.createObjectURL(new Blob([asset.data], { type: asset.mime }));
}
