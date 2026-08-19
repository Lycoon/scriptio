/**
 * Storage provider abstraction for local persistence.
 * Uses IndexedDB on both browser and Tauri desktop.
 */

import type { InstalledDictionary, UserSettings } from "@src/lib/utils/types";

export interface CachedProject {
    id: string;
    title: string;
    description: string | null;
    author: string | null;
    createdAt: Date;
    updatedAt: Date;
    /** True if the project is device-local only (never synced to cloud). */
    isLocalOnly: boolean;
}

export interface ProjectEntryInput {
    id: string;
    title: string;
    description: string | null;
    author?: string | null;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * A binary resource (currently board images) stored locally, decoupled from the
 * Yjs document. Content-addressed by SHA-256 so the same bytes are stored once.
 * Scoped per project: the primary key is `${projectId}/${hash}`.
 */
export interface StoredAsset {
    /** Primary key: `${projectId}/${hash}`. */
    key: string;
    /** Owning project id (indexed, for per-project list/delete). */
    projectId: string;
    /** SHA-256 hex digest of `blob` — this is the assetId referenced by cards. */
    hash: string;
    mime: string;
    size: number;
    /** Intrinsic pixel dimensions, used to size the card on first drop. */
    width: number;
    height: number;
    /** Raw image bytes. Stored as ArrayBuffer (not Blob) for WebKit IndexedDB
     *  compatibility, matching the dictionaries/migration-backup stores. */
    data: ArrayBuffer;
    createdAt: number;
}

/**
 * A project's poster image, stored locally so it survives offline and exists at
 * all for local-only projects. One per project (replaced in place, not
 * content-addressed), which is why the project id is the key.
 */
export interface StoredPoster {
    /** Primary key: the owning project id. */
    projectId: string;
    mime: string;
    /** Raw image bytes. ArrayBuffer (not Blob) for WebKit IndexedDB
     *  compatibility, matching the assets/dictionaries stores. */
    data: ArrayBuffer;
    /** SHA-256 hex of `data`, used to skip no-op writes when revalidating
     *  against the cloud copy. */
    hash: string;
    /** True while these bytes exist only on this device — either the project is
     *  local-only, or it is cloud-synced but the upload hasn't landed yet
     *  (offline edit). Cleared once the cloud holds the same bytes. */
    pendingUpload: boolean;
    updatedAt: number;
}

export interface StorageProvider {
    // Project CRUD
    createProject(id: string, title: string, description?: string, synced?: boolean, author?: string): Promise<void>;
    getAll(): Promise<CachedProject[]>;
    get(id: string): Promise<CachedProject | null>;
    update(id: string, updates: { title?: string; description?: string; author?: string }): Promise<void>;
    markAsSynced(id: string): Promise<void>;
    touch(id: string): Promise<void>;
    delete(id: string): Promise<void>;
    exists(id: string): Promise<boolean>;

    /** Upsert cloud project metadata locally (cache for offline access). */
    ensureEntries(projects: ProjectEntryInput[]): Promise<void>;

    // Settings
    getSettings(): Promise<Partial<UserSettings>>;
    saveSettings(updates: Partial<UserSettings>): Promise<void>;

    // Dictionaries
    saveDictionary(code: string, aff: Uint8Array, dic: Uint8Array): Promise<void>;
    loadDictionary(code: string): Promise<{ aff: Uint8Array; dic: Uint8Array } | null>;
    deleteDictionary(code: string): Promise<void>;
    listInstalledDictionaries(): Promise<InstalledDictionary[]>;

    // Migration backups: pre-migration Yjs document snapshots (one per project).
    // Used by the project-doc migration runner to roll back if a step throws.
    saveMigrationBackup(projectId: string, snapshot: Uint8Array, fromVersion: number): Promise<void>;
    loadMigrationBackup(projectId: string): Promise<{ snapshot: Uint8Array; fromVersion: number } | null>;
    clearMigrationBackup(projectId: string): Promise<void>;

    // Assets: content-addressed binary resources (board images), per project.
    putAsset(asset: StoredAsset): Promise<void>;
    hasAsset(projectId: string, hash: string): Promise<boolean>;
    getAsset(projectId: string, hash: string): Promise<StoredAsset | null>;
    /** SHA-256 hashes of every asset stored for a project. */
    listAssetHashes(projectId: string): Promise<string[]>;
    deleteAsset(projectId: string, hash: string): Promise<void>;
    /** Remove every asset belonging to a project (called on project deletion). */
    deleteProjectAssets(projectId: string): Promise<void>;
    /** Duplicate every asset of `fromProjectId` under `toProjectId` (id-changing copy). */
    copyProjectAssets(fromProjectId: string, toProjectId: string): Promise<void>;

    // Posters: one image per project, stored locally for offline / local-only use.
    putPoster(poster: StoredPoster): Promise<void>;
    getPoster(projectId: string): Promise<StoredPoster | null>;
    deletePoster(projectId: string): Promise<void>;
    /** Duplicate the poster of `fromProjectId` under `toProjectId` (id-changing copy). */
    copyPoster(fromProjectId: string, toProjectId: string): Promise<void>;
}

// Singleton cache
let cachedProvider: StorageProvider | null = null;

/**
 * Returns the IndexedDB StorageProvider (used on both browser and desktop).
 */
export async function getStorageProvider(): Promise<StorageProvider> {
    if (cachedProvider) return cachedProvider;

    const { IndexedDBStorageProvider } = await import("./indexeddb-storage-provider");
    cachedProvider = new IndexedDBStorageProvider();

    return cachedProvider;
}
