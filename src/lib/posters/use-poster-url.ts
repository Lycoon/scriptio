"use client";

/**
 * Resolve a project's poster to an object URL for rendering.
 *
 * Reads the local-first {@link ./poster-store} rather than a signed cloud URL,
 * so a local-only project shows its poster and a cloud project keeps showing
 * one offline. Each consumer owns its URL (a poster appears once per screen, so
 * there is nothing to share) and revokes it on unmount; a poster replaced by the
 * user — or pulled in by a background revalidation — bumps the project's poster
 * version, which re-runs the load.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getPosterVersion, loadPosterBlob, subscribeToPosters } from "./poster-store";

/**
 * Object URL for the project's poster, or null while loading / when it has none.
 *
 * `cloudSynced` is an optional hint for callers that already know the project is
 * a cloud one (its membership payload says so) — it lets the poster load on a
 * fresh device in the same pass that writes the project to the local cache.
 */
export function usePosterUrl(projectId: string | null | undefined, cloudSynced?: boolean): string | null {
    const version = useSyncExternalStore(
        subscribeToPosters,
        useCallback(() => getPosterVersion(projectId), [projectId]),
        () => 0,
    );

    // Tag the loaded URL with the project + poster version it belongs to, so a
    // stale poster is never shown while a new one loads (and so the no-poster
    // case resolves to null without a setState from the effect body).
    const key = projectId ? `${projectId}:${version}:${cloudSynced}` : null;
    const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);

    useEffect(() => {
        if (!projectId) return;

        const k = `${projectId}:${version}:${cloudSynced}`;
        let active = true;
        let created: string | null = null;

        void loadPosterBlob(projectId, cloudSynced)
            .then((blob) => {
                if (!active || !blob) return;
                created = URL.createObjectURL(blob);
                setLoaded({ key: k, url: created });
            })
            .catch((e) => console.warn("[posters] failed to load poster:", e));

        return () => {
            active = false;
            if (created) URL.revokeObjectURL(created);
        };
    }, [projectId, version, cloudSynced]);

    return key && loaded?.key === key ? loaded.url : null;
}
