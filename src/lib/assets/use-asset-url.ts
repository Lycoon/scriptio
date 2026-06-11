"use client";

/**
 * Resolve a board image asset to an object URL for rendering.
 *
 * Backed by a module-level, ref-counted cache keyed by `${projectId}/${hash}`,
 * so the same image used by several cards shares one object URL (no flicker) and
 * the URL is revoked only when the last consumer unmounts (no leaks).
 */

import { useEffect, useState } from "react";
import { loadAssetObjectUrl } from "./asset-store";

interface CacheEntry {
    refCount: number;
    promise: Promise<string | null>;
}

const cache = new Map<string, CacheEntry>();

const cacheKey = (projectId: string, hash: string) => `${projectId}/${hash}`;

function acquire(projectId: string, hash: string): Promise<string | null> {
    const key = cacheKey(projectId, hash);
    let entry = cache.get(key);
    if (!entry) {
        entry = { refCount: 0, promise: loadAssetObjectUrl(projectId, hash) };
        cache.set(key, entry);
    }
    entry.refCount++;
    return entry.promise;
}

function release(projectId: string, hash: string): void {
    const key = cacheKey(projectId, hash);
    const entry = cache.get(key);
    if (!entry) return;
    entry.refCount--;
    if (entry.refCount <= 0) {
        cache.delete(key);
        void entry.promise.then((url) => {
            if (url) URL.revokeObjectURL(url);
        });
    }
}

/** Object URL for the asset, or null while loading / when not stored locally. */
export function useAssetUrl(
    projectId: string | null | undefined,
    assetId: string | null | undefined,
): string | null {
    // Tag the loaded URL with its key so a stale image is never shown while a
    // new asset loads (and so the no-asset case returns null without setState).
    const key = projectId && assetId ? cacheKey(projectId, assetId) : null;
    const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);

    useEffect(() => {
        if (!projectId || !assetId) return;
        const k = cacheKey(projectId, assetId);
        let active = true;
        void acquire(projectId, assetId).then((resolved) => {
            if (active && resolved) setLoaded({ key: k, url: resolved });
        });
        return () => {
            active = false;
            release(projectId, assetId);
        };
    }, [projectId, assetId]);

    return key && loaded?.key === key ? loaded.url : null;
}
