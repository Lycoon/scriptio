/**
 * Poster store façade.
 *
 * The single chokepoint for reading/writing a project's poster image. Posters
 * are local-first, exactly like board assets: the bytes always land in
 * IndexedDB (so a local-only project can have one, and a cloud project still
 * renders its poster offline), and for cloud-synced projects this seam also
 * mirrors them to R2 — upload on save, fetch on a local cache miss — via
 * {@link ./cloud-poster-sync}.
 *
 * One poster per project, replaced in place, so it is keyed by project id
 * rather than content-addressed.
 */

import { getStorageProvider, type StoredPoster } from "../persistence/storage-provider/storage-provider";
import { sha256Hex } from "../assets/asset-hash";
import { cropImageToJpegBlob } from "../utils/misc";

/** Poster canvas size — a 2:3 movie-poster ratio, matching the settings hint. */
export const POSTER_WIDTH = 600;
export const POSTER_HEIGHT = 900;

/**
 * Whether a project syncs to the cloud, so network calls never fire for a
 * local-only one. The local cache is authoritative whenever it knows the
 * project; `hint` only covers the window before a freshly listed cloud project
 * has been written to the cache (its membership payload already says so).
 */
async function isCloudSynced(projectId: string, hint?: boolean): Promise<boolean> {
    const cached = await (await getStorageProvider()).get(projectId);
    if (cached) return !cached.isLocalOnly;
    return hint ?? false;
}

// ── Change notification ──────────────────────────────────────────────────────
// A poster is mutable at a fixed key, so consumers can't cache it by identity
// the way they can a content-addressed asset. Bumping a per-project version
// tells every mounted `usePosterUrl` to re-read the bytes.

const versions = new Map<string, number>();
const listeners = new Set<() => void>();

export function getPosterVersion(projectId: string | null | undefined): number {
    return projectId ? (versions.get(projectId) ?? 0) : 0;
}

export function subscribeToPosters(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notifyPosterChanged(projectId: string): void {
    versions.set(projectId, getPosterVersion(projectId) + 1);
    for (const listener of listeners) listener();
}

// ── Read ─────────────────────────────────────────────────────────────────────

/** Projects whose poster has already been settled against the cloud this
 *  session — checked once per session, not on every render. Covers both answers:
 *  "here it is" and "there is none", so a posterless project stops costing a
 *  request every time the project list is rendered. */
const checkedWithCloud = new Set<string>();

/**
 * The project's poster as a Blob, or null when it has none.
 *
 * Local bytes win so the poster paints instantly and works offline; a cloud
 * project with nothing cached (a fresh device) pulls from R2 and caches the
 * result. When a local copy is served, a one-shot background revalidation picks
 * up a poster changed on another device and notifies subscribers.
 */
export async function loadPosterBlob(projectId: string, cloudSyncedHint?: boolean): Promise<Blob | null> {
    const provider = await getStorageProvider();
    const local = await provider.getPoster(projectId);

    if (local) {
        void revalidatePoster(projectId, cloudSyncedHint).catch(() => {});
        return new Blob([local.data], { type: local.mime });
    }

    if (checkedWithCloud.has(projectId)) return null;

    const fetched = await fetchAndCachePoster(projectId, cloudSyncedHint);
    return fetched ? new Blob([fetched.data], { type: fetched.mime }) : null;
}

/** Pull the cloud copy into the local cache. Null for local-only projects, when
 *  the project has no cloud poster, or when the request fails (offline). */
async function fetchAndCachePoster(projectId: string, cloudSyncedHint?: boolean): Promise<StoredPoster | null> {
    if (!(await isCloudSynced(projectId, cloudSyncedHint))) return null;

    const { fetchPosterFromCloud } = await import("./cloud-poster-sync");
    const remote = await fetchPosterFromCloud(projectId);
    // "none" is a real answer and worth remembering; only an offline attempt is
    // left open for the next try.
    if (remote.status === "none") checkedWithCloud.add(projectId);
    if (remote.status !== "ok") return null;

    const stored: StoredPoster = {
        projectId,
        mime: remote.mime,
        data: remote.data,
        hash: await sha256Hex(remote.data),
        pendingUpload: false,
        updatedAt: Date.now(),
    };

    const provider = await getStorageProvider();
    await provider.putPoster(stored);
    checkedWithCloud.add(projectId);
    return stored;
}

/**
 * Refresh the cached poster from the cloud once per session, so a poster set on
 * another device shows up here. Skipped while a local upload is still pending —
 * those bytes are the newer ones and must not be overwritten by the stale copy
 * the cloud still holds.
 */
export async function revalidatePoster(projectId: string, cloudSyncedHint?: boolean): Promise<void> {
    if (checkedWithCloud.has(projectId)) return;
    if (!(await isCloudSynced(projectId, cloudSyncedHint))) return;

    const provider = await getStorageProvider();
    const local = await provider.getPoster(projectId);
    if (local?.pendingUpload) return;

    checkedWithCloud.add(projectId);

    const { fetchPosterFromCloud } = await import("./cloud-poster-sync");
    const remote = await fetchPosterFromCloud(projectId);
    if (remote.status === "unavailable") {
        // Offline: keep the cached poster and let the next open try again.
        checkedWithCloud.delete(projectId);
        return;
    }
    // "none" — the cloud has no poster for this project (e.g. promoted before it
    // had one). Keep whatever is cached; a stale poster beats a blank one.
    if (remote.status === "none") return;

    const hash = await sha256Hex(remote.data);
    if (local && local.hash === hash) return;

    await provider.putPoster({
        projectId,
        mime: remote.mime,
        data: remote.data,
        hash,
        pendingUpload: false,
        updatedAt: Date.now(),
    });
    notifyPosterChanged(projectId);
}

// ── Write ────────────────────────────────────────────────────────────────────

/**
 * Set a project's poster from a user-picked image file.
 *
 * The image is re-encoded to a {@link POSTER_WIDTH}x{@link POSTER_HEIGHT} JPEG
 * and stored locally first, so the change is instant and survives being offline
 * or local-only. The cloud push is best-effort: if it fails the record stays
 * flagged `pendingUpload` and {@link pushPendingPoster} retries on next open.
 */
export async function savePosterFromFile(projectId: string, file: File): Promise<void> {
    const blob = await cropImageToJpegBlob(file, POSTER_WIDTH, POSTER_HEIGHT);
    const data = await blob.arrayBuffer();

    const provider = await getStorageProvider();
    await provider.putPoster({
        projectId,
        mime: blob.type || "image/jpeg",
        data,
        hash: await sha256Hex(data),
        pendingUpload: true,
        updatedAt: Date.now(),
    });
    // These bytes are now the newest ones — a pending revalidation must not
    // clobber them with the copy the cloud still holds.
    checkedWithCloud.add(projectId);
    notifyPosterChanged(projectId);

    await pushPendingPoster(projectId);
}

/**
 * Upload a locally-stored poster the cloud doesn't have yet — a poster set
 * while offline, or one carried over when a local-only project was promoted.
 * Best-effort and a no-op for local-only projects, so it is safe to fire on
 * every project open.
 */
export async function pushPendingPoster(projectId: string): Promise<void> {
    if (!(await isCloudSynced(projectId))) return;

    const provider = await getStorageProvider();
    const poster = await provider.getPoster(projectId);
    if (!poster || !poster.pendingUpload) return;

    try {
        const { uploadPosterToCloud } = await import("./cloud-poster-sync");
        await uploadPosterToCloud(projectId, poster.data, poster.mime);
    } catch (e) {
        console.warn("[posters] pending upload failed:", e);
        return;
    }

    // Re-read before clearing the flag: the user may have picked another image
    // while the upload was in flight, and that one still needs pushing.
    const current = await provider.getPoster(projectId);
    if (current && current.hash === poster.hash) {
        await provider.putPoster({ ...current, pendingUpload: false });
    }
}
