/**
 * Pure helper for cloud asset GC: which stored hashes are collectable.
 *
 * Mirrors the local mark-sweep but adds a grace window — an orphan younger than
 * the window is spared, so an asset a collaborator just added isn't reaped by a
 * client whose referencing card hasn't synced yet. Kept dependency-free so it's
 * unit-testable and shared by the GC route.
 */
export function computeAssetOrphans(
    stored: { hash: string; createdAt: Date }[],
    referenced: Set<string>,
    now: number,
    graceMs: number,
): string[] {
    const cutoff = now - graceMs;
    const ref = new Set([...referenced].map((h) => h.toLowerCase()));
    return stored
        .filter((a) => !ref.has(a.hash.toLowerCase()) && a.createdAt.getTime() < cutoff)
        .map((a) => a.hash);
}
