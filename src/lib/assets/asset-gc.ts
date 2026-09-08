/**
 * Asset garbage collection (reconcile-from-doc / mark-sweep).
 *
 * Image/audio bytes live in IndexedDB, decoupled from Yjs; the board cards only
 * carry the `assetId` (SHA-256). What is still in use is derived, every time,
 * from the documents that could reference it — robust against collaboration and
 * crashes, with no persisted reference counter to drift.
 *
 * "The documents that could reference it" is the live doc *plus every retained
 * snapshot*, because a version history is a promise that a past version can be
 * restored, and a version whose images have been collected is not restorable.
 * The two sides answer that question from the same kind of index, recorded when
 * the snapshot was written and the document was already in memory: the Worker
 * from its `snapshot_assets` SQLite table, this file from each snapshot row's
 * `assetHashes`. And both fail the same way — if any snapshot's references
 * couldn't be read, nothing is deleted at all, since a sweep working from an
 * incomplete reference set deletes exactly the assets it failed to see.
 *
 * Cloud GC ({@link gcCloudProjectAssets}) remains separate and
 * server-authoritative, and is run sparingly — on project open, not on every
 * edit — because it scans snapshots server-side.
 */

import type { ProjectState } from "../project/project-state";
import { getStorageProvider } from "../persistence/storage-provider/storage-provider";
import { collectReferencedHashes, SkipGcError } from "./asset-refs";

export { collectReferencedHashes };

/**
 * Delete every locally-stored asset of `projectId` that neither `ydoc` nor any
 * of the project's local snapshots references. No-ops safely if any of those
 * reference sets is unreadable. Local only — cloud assets are reconciled by
 * {@link gcCloudProjectAssets}.
 *
 * The snapshot half is unconditional rather than gated on the project being
 * local-only: a cloud project has no local snapshots, so it lists none and this
 * costs it one empty index read.
 */
export async function gcProjectAssets(projectId: string, ydoc: ProjectState): Promise<void> {
    let referenced: Set<string>;
    try {
        referenced = collectReferencedHashes(ydoc);
    } catch (e) {
        if (e instanceof SkipGcError) return;
        throw e;
    }

    const provider = await getStorageProvider();

    // Metadata only — the snapshots' bytes stay in their sibling store, so this
    // never decodes a history to find out what it holds.
    for (const snapshot of await provider.listSnapshots(projectId)) {
        // One snapshot we can't read for is enough to make the whole sweep
        // unsafe: we would be deciding an asset is unreferenced on the strength
        // of a reference list we know to be short.
        if (snapshot.assetsUnparsed) return;
        for (const hash of snapshot.assetHashes) referenced.add(hash);
    }

    const stored = await provider.listAssetHashes(projectId);
    const orphans = stored.filter((hash) => !referenced.has(hash));
    await Promise.all(orphans.map((hash) => provider.deleteAsset(projectId, hash)));
}

/**
 * Reclaim a cloud project's orphaned R2 assets. Delegates to the server, which
 * computes the referenced set authoritatively from the live doc + all snapshots.
 * No-op for local-only projects. Best-effort: never throws into callers.
 */
export async function gcCloudProjectAssets(projectId: string): Promise<void> {
    const { isCloudSyncedProject } = await import("../persistence/storage-provider/local-persistence");
    if (!(await isCloudSyncedProject(projectId))) return;
    const { gcCloudAssets } = await import("./cloud-asset-sync");
    await gcCloudAssets(projectId).catch((e) => console.warn("[assets] cloud GC failed:", e));
}

// ── Debounced scheduler ──────────────────────────────────────────────────────

const GC_DEBOUNCE_MS = 1500;
const pending = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Schedule a debounced local reconcile (per projectId). Rapid edits — a burst of
 * card deletions, say — coalesce into a single sweep. Cloud GC is intentionally
 * not run here (it's run on project open via {@link gcCloudProjectAssets}).
 */
export function scheduleAssetGc(projectId: string, ydoc: ProjectState): void {
    const existing = pending.get(projectId);
    if (existing) clearTimeout(existing);
    pending.set(
        projectId,
        setTimeout(() => {
            pending.delete(projectId);
            void gcProjectAssets(projectId, ydoc).catch((e) =>
                console.warn("[assets] GC failed:", e),
            );
        }, GC_DEBOUNCE_MS),
    );
}
