/**
 * Asset garbage collection (reconcile-from-doc / mark-sweep).
 *
 * Image/audio bytes live in IndexedDB, decoupled from Yjs; the board cards only
 * carry the `assetId` (SHA-256). The set of assetIds referenced across every
 * board is the source of truth for what is still in use. Local GC computes that
 * set from the live doc and deletes any stored blob not in it — robust against
 * collaboration and crashes, with no persisted reference counter to drift.
 *
 * Cloud GC ({@link gcCloudProjectAssets}) is separate and server-authoritative:
 * the Worker reconciles against the live doc *and every retained snapshot* (so a
 * restorable version never loses its assets), and it's run sparingly — on project
 * open, not on every edit — because it scans snapshots.
 */

import type { ProjectState } from "../project/project-state";
import { getStorageProvider } from "../persistence/storage-provider/storage-provider";
import { collectReferencedHashes, SkipGcError } from "./asset-refs";

export { collectReferencedHashes };

/**
 * Delete every locally-stored asset of `projectId` whose hash is not referenced
 * by any board card in `ydoc`. No-ops safely if a board's cards blob can't be
 * parsed. Local only — cloud assets are reconciled by {@link gcCloudProjectAssets}.
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
