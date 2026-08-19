/**
 * Cloud (R2) side of the poster store.
 *
 * Mirrors the local IndexedDB poster to R2 at `poster-{projectId}`, proxied
 * through the same-origin API so the bucket stays private (no R2 CORS setup),
 * exactly like board assets. Used only for cloud-synced projects; a local-only
 * project never touches the network.
 */

import { apiFetch } from "@src/lib/api-client";

/** Push the poster bytes to R2, flipping the project's `hasPoster` flag. */
export async function uploadPosterToCloud(projectId: string, data: ArrayBuffer, mime: string): Promise<void> {
    const res = await apiFetch(`/api/projects/${projectId}/poster`, {
        method: "PUT",
        headers: { "Content-Type": mime },
        body: data,
    });

    if (!res.ok) throw new Error(`Poster upload failed (${res.status})`);
}

/**
 * The outcome of asking the cloud for a project's poster. "none" and
 * "unavailable" are deliberately distinct: the first is an answer (this project
 * has no cloud poster), the second is the absence of one (offline), and only
 * the latter is worth retrying.
 */
export type CloudPosterResult =
    | { status: "ok"; data: ArrayBuffer; mime: string }
    | { status: "none" }
    | { status: "unavailable" };

/** Fetch the project's poster bytes from the API, ready to cache locally. */
export async function fetchPosterFromCloud(projectId: string): Promise<CloudPosterResult> {
    let res: Response;
    try {
        res = await apiFetch(`/api/projects/${projectId}/poster`, { method: "GET" });
    } catch {
        return { status: "unavailable" }; // offline
    }

    if (res.status === 404) return { status: "none" };
    if (!res.ok) return { status: "unavailable" };

    const data = await res.arrayBuffer();
    if (data.byteLength === 0) return { status: "none" };

    return { status: "ok", data, mime: res.headers.get("Content-Type") || "image/jpeg" };
}
