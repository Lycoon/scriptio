/**
 * Cloud (R2) side of the asset store.
 *
 * Mirrors the local IndexedDB asset store to R2 at `assets/{projectId}/{hash}`,
 * tracked per project in Postgres so duplicates collapse and orphans are swept
 * the same way they are locally. Used only for cloud-synced projects; local-only
 * projects never touch the network.
 */

import { apiFetch } from "@src/lib/api-client";
import type { ApiResponse } from "@src/lib/utils/api-utils";
import type { StoredAsset } from "../persistence/storage-provider/storage-provider";

/** Thrown when an upload would push the owner over their storage quota (HTTP 507). */
export class CloudQuotaError extends Error {
    constructor(message = "Storage limit reached") {
        super(message);
        this.name = "CloudQuotaError";
    }
}

export interface StorageUsage {
    projectUsed: number;
    ownerTotalUsed: number;
    quota: number;
}

/** Metadata for one tracked asset (no bytes), for the Storage dashboard. */
export interface ProjectAssetInfo {
    hash: string;
    mime: string;
    size: number;
    width: number;
    height: number;
}

/**
 * Upload an asset's bytes to R2 (idempotent server-side; an already-stored hash
 * is a cheap no-op). Throws {@link CloudQuotaError} when the owner is out of room.
 */
export async function uploadAssetToCloud(projectId: string, asset: StoredAsset): Promise<void> {
    const params = new URLSearchParams({
        hash: asset.hash,
        mime: asset.mime,
        w: String(asset.width),
        h: String(asset.height),
    });

    const res = await apiFetch(`/api/projects/${projectId}/assets?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: asset.data,
    });

    if (res.status === 507) throw new CloudQuotaError();
    if (!res.ok) throw new Error(`Asset upload failed (${res.status})`);
}

/**
 * Fetch an asset's bytes from the API, returning a StoredAsset ready to cache
 * locally. Null if the asset isn't tracked or the request fails. Intrinsic
 * dimensions aren't needed once a card exists (they only size a card on first
 * drop), so the cached copy carries 0.
 */
export async function fetchAssetFromCloud(projectId: string, hash: string): Promise<StoredAsset | null> {
    const res = await apiFetch(`/api/projects/${projectId}/assets/${hash}`, { method: "GET" });
    if (!res.ok) return null;

    const data = await res.arrayBuffer();
    const mime = res.headers.get("Content-Type") || "application/octet-stream";

    return {
        key: `${projectId}/${hash}`,
        projectId,
        hash,
        mime,
        size: data.byteLength,
        width: 0,
        height: 0,
        data,
        createdAt: Date.now(),
    };
}

/**
 * Trigger a server-authoritative cloud GC. The server computes the referenced
 * set from the live doc + every retained snapshot (so restorable versions keep
 * their assets) and deletes the rest.
 */
export async function gcCloudAssets(projectId: string): Promise<void> {
    const res = await apiFetch(`/api/projects/${projectId}/assets/gc`, { method: "POST" });
    if (!res.ok) throw new Error(`Cloud asset GC failed (${res.status})`);
}

/** Of `hashes`, which the cloud doesn't yet have tracked for this project (so they
 *  need (re)uploading — e.g. assets added while offline). Empty on failure. */
export async function fetchMissingAssetHashes(projectId: string, hashes: string[]): Promise<string[]> {
    const res = await apiFetch(`/api/projects/${projectId}/assets/missing`, {
        method: "POST",
        body: JSON.stringify({ hashes }),
    });
    if (!res.ok) return [];
    const { data } = (await res.json()) as ApiResponse<{ missing: string[] }>;
    return data?.missing ?? [];
}

/** All tracked assets for a project (cloud), for the Storage dashboard. Empty on failure. */
export async function fetchProjectAssetInfos(projectId: string): Promise<ProjectAssetInfo[]> {
    const res = await apiFetch(`/api/projects/${projectId}/assets`, { method: "GET" });
    if (!res.ok) return [];
    const { data } = (await res.json()) as ApiResponse<{ assets: ProjectAssetInfo[] }>;
    return data?.assets ?? [];
}

/** Per-project + owner-global storage usage, for the navbar panel. */
export async function fetchProjectStorage(projectId: string): Promise<StorageUsage | null> {
    const res = await apiFetch(`/api/projects/${projectId}/storage`, { method: "GET" });
    if (!res.ok) return null;
    const { data } = (await res.json()) as ApiResponse<StorageUsage>;
    return data ?? null;
}

/** The current user's owner-global usage + quota (for the promote-to-cloud pre-check). */
export async function fetchMyStorage(): Promise<{ used: number; quota: number } | null> {
    const res = await apiFetch(`/api/users/me/storage`, { method: "GET" });
    if (!res.ok) return null;
    const { data } = (await res.json()) as ApiResponse<{ used: number; quota: number }>;
    return data ?? null;
}
