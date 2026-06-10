/**
 * Asset garbage collection (reconcile-from-doc / mark-sweep).
 *
 * Image bytes live in IndexedDB, decoupled from Yjs; the board cards only carry
 * the `assetId` (SHA-256). The set of assetIds referenced across every board in
 * the document is therefore the source of truth for what is still in use. GC
 * computes that set and deletes any stored blob not in it — robust against
 * collaboration and crashes, with no persisted reference counter to drift.
 */

import type { BoardCardData } from "../project/project-doc";
import type { ProjectState } from "../project/project-state";
import { getStorageProvider } from "../persistence/storage-provider/storage-provider";

/** Every asset hash referenced by an image card across all board documents. */
export function collectReferencedHashes(ydoc: ProjectState): Set<string> {
    const referenced = new Set<string>();
    ydoc.documents().forEach((node) => {
        if (node.type !== "board") return;
        const raw = ydoc.boardData(node.id).get("cards");
        if (!raw) return;
        try {
            const cards = JSON.parse(raw) as BoardCardData[];
            for (const card of cards) {
                if (card.type === "image" && card.assetId) referenced.add(card.assetId);
            }
        } catch {
            // A malformed cards blob shouldn't make us delete live assets — skip.
            // (Conservative: treat as "references unknown", handled below.)
            throw new SkipGcError();
        }
    });
    return referenced;
}

/** Internal sentinel: a parse failure means we can't safely reconcile this run. */
class SkipGcError extends Error {}

/**
 * Delete every stored asset of `projectId` whose hash is not referenced by any
 * board card in `ydoc`. No-ops safely if a board's cards blob can't be parsed.
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

// ── Debounced scheduler ──────────────────────────────────────────────────────

const GC_DEBOUNCE_MS = 1500;
const pending = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Schedule a debounced project-wide reconcile (per projectId). Rapid edits — a
 * burst of card deletions, say — coalesce into a single sweep.
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
