/**
 * Collect the asset hashes a project document references.
 *
 * Worker-safe: depends only on the pure `ProjectState`/`BoardCardData` types
 * (no IndexedDB, React, or ProseMirror), so the Cloudflare DurableObject can run
 * it over the live doc and over historical snapshots when deciding what's safe to
 * garbage-collect.
 */

import type { BoardCardData, ProjectState } from "../project/project-doc";

/** Sentinel: a board's cards blob couldn't be parsed, so we can't safely reconcile. */
export class SkipGcError extends Error {}

/** Every asset hash referenced by an image or audio card across all board documents. */
export function collectReferencedHashes(ydoc: ProjectState): Set<string> {
    const referenced = new Set<string>();
    ydoc.documents().forEach((node) => {
        if (node.type !== "board") return;
        const raw = ydoc.boardData(node.id).get("cards");
        if (!raw) return;
        try {
            const cards = JSON.parse(raw) as BoardCardData[];
            for (const card of cards) {
                if ((card.type === "image" || card.type === "audio") && card.assetId)
                    referenced.add(card.assetId);
            }
        } catch {
            // A malformed cards blob shouldn't make us delete live assets — skip.
            throw new SkipGcError();
        }
    });
    return referenced;
}
