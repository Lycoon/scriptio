/**
 * Cloud asset storage limits.
 *
 * Quota is owner-centric: every asset in a project counts against the project
 * OWNER's single pool, summed across all projects they own (see the
 * `ProjectAsset` model and the asset upload route). These are plain constants —
 * tune here.
 */

/** Total cloud-storage budget per owner, shared across all of their projects. */
export const USER_STORAGE_QUOTA_BYTES = 5 * 1024 ** 3; // 5 GB

/** Hard cap on a single uploaded asset, to bound individual requests. */
export const MAX_ASSET_SIZE_BYTES = 50 * 1024 ** 2; // 50 MB

/**
 * Hard cap on a project poster upload. Posters are re-encoded client-side to a
 * 600x900 JPEG, so this only bounds a malformed or hostile request. They are one
 * small object per project and are not metered against the owner's quota.
 */
export const MAX_POSTER_SIZE_BYTES = 4 * 1024 ** 2; // 4 MB

/**
 * Grace window before a cloud orphan is eligible for GC. Protects an asset a
 * collaborator just added whose referencing card hasn't yet synced to the client
 * that runs the sweep.
 */
export const CLOUD_ASSET_GC_GRACE_MS = 5 * 60 * 1000; // 5 minutes
