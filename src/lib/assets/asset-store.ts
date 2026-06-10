/**
 * Local asset store façade.
 *
 * The single chokepoint for reading/writing board image bytes, decoupled from
 * the Yjs document. Assets are stored in IndexedDB content-addressed by SHA-256
 * (so duplicates collapse) and scoped per project. A future cloud variant will
 * extend this seam to also upload to / fetch from R2.
 */

import { getStorageProvider } from "../persistence/storage-provider/storage-provider";
import { sha256Hex } from "./asset-hash";

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
 * Store an image file for a project and return its metadata. Idempotent: if an
 * asset with the same bytes already exists it is returned unchanged (dedup).
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

/**
 * Resolve an asset to an object URL for rendering, or null if it isn't stored
 * locally. Callers own the URL and must `URL.revokeObjectURL` it when done.
 */
export async function loadAssetObjectUrl(projectId: string, hash: string): Promise<string | null> {
    const provider = await getStorageProvider();
    const asset = await provider.getAsset(projectId, hash);
    if (!asset) return null;
    return URL.createObjectURL(new Blob([asset.data], { type: asset.mime }));
}
