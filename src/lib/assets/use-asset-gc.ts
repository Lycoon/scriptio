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
import { gcCloudProjectAssets, gcProjectAssets, scheduleAssetGc } from "./asset-gc";
import { pushPendingAssets } from "./asset-store";

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

        // Cloud reconcile runs once per open (it scans snapshots server-side, so
        // it's intentionally not tied to per-edit sweeps).
        void gcCloudProjectAssets(projectId);

        // Re-upload anything added offline that the cloud is still missing.
        void pushPendingAssets(projectId, ydoc);

        return repository.observeDocuments(() => scheduleAssetGc(projectId, ydoc));
    }, [projectId, repository, isReady]);
}
