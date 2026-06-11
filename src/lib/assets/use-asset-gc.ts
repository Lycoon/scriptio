"use client";

/**
 * Mount once per project (in ProjectProvider) to keep IndexedDB assets in sync
 * with the document. Runs a reconcile when the project becomes ready (clears
 * orphans left by prior sessions, remote deletions, or crashes) and again,
 * debounced, whenever the document tree changes — board/folder deletions clear
 * their board maps, which can orphan images. Per-card deletions are handled
 * separately in BoardCanvas (they don't touch the documents map).
 */

import { useEffect } from "react";
import type { ProjectRepository } from "../project/project-repository";
import { gcProjectAssets, scheduleAssetGc } from "./asset-gc";

export function useAssetGc(
    projectId: string | null,
    repository: ProjectRepository | null,
    isReady: boolean,
): void {
    useEffect(() => {
        if (!projectId || !repository || !isReady) return;
        const ydoc = repository.getState();

        void gcProjectAssets(projectId, ydoc).catch((e) =>
            console.warn("[assets] initial GC failed:", e),
        );

        return repository.observeDocuments(() => scheduleAssetGc(projectId, ydoc));
    }, [projectId, repository, isReady]);
}
