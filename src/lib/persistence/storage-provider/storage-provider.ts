/**
 * Storage provider abstraction for local persistence.
 * Uses IndexedDB on both browser and Tauri desktop.
 */

import type { InstalledDictionary, UserSettings } from "@src/lib/utils/types";

/**
 * Fingerprint of a bound `.scriptio` file as we last left it.
 *
 * Recorded so the writer can tell "nobody has touched this since I wrote it"
 * from "something else wrote here" — a sync client, a second app instance, a
 * restored backup. A whole-archive rewrite is not a merge, so writing blindly
 * over the second case discards whatever the other side put there while the
 * local project goes on looking perfectly healthy. See `file-binding.ts`.
 */
export interface FileFingerprint {
    /** Modification time reported by the filesystem, epoch ms. */
    mtimeMs: number;
    /** Size in bytes. Cheap second opinion where mtime granularity is coarse. */
    size: number;
}

export interface CachedProject {
    id: string;
    title: string;
    description: string | null;
    author: string | null;
    createdAt: Date;
    updatedAt: Date;
    /** True if the project is device-local only (never synced to cloud). */
    isLocalOnly: boolean;

    // ── File binding (desktop only) ──────────────────────────────────────────
    // A project may additionally be bound to a `.scriptio` file on disk, which
    // Scriptio keeps up to date on its own. Absent on every unbound project,
    // which is all of them on web and mobile.

    /** Absolute path of the bound file; absent when unbound. */
    filePath?: string;
    /** Epoch ms the binding was created. */
    fileBoundAt?: number;
    /** Epoch ms of the last successful write to that file. */
    fileLastWriteAt?: number;
    /**
     * Yjs state vector as of that write. The skip check: if the document has not
     * moved past this, re-emitting the whole archive would produce the same file.
     */
    fileLastWriteSv?: Uint8Array;
    /** What the file looked like on disk once we finished writing it. */
    fileFingerprint?: FileFingerprint;
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

/**
 * One entry in a project's device-local version history: everything the panel
 * and the asset reconciler need, with the Yjs update itself kept in a sibling
 * store (see the baseline migration).
 */
export interface SnapshotMeta {
    /** Primary key, shared with the `snapshot_data` row holding the bytes:
     *  `${projectId}/${type}/${new Date().toISOString()}`. */
    key: string;
    /** Owning project id (indexed, for per-project list/delete). */
    projectId: string;
    type: "auto" | "manual";
    /** Manual saves only. A real field, not a suffix on the key: only R2's
     *  metadata-less `list()` ever forced the cloud into that trick. */
    name?: string;
    /** Epoch ms. */
    createdAt: number;
    /** Byte length of the stored update, for the history's storage budget. */
    size: number;
    /** SHA-256 of the stored update, so an auto-snapshot can tell that the
     *  document has not moved since the last one and skip writing a copy. */
    contentHash: string;
    /**
     * The asset hashes this snapshot's boards reference, recorded at write time
     * while the document is already in memory — the local mirror of the
     * DurableObject's `snapshot_assets` index. Asset GC unions these with the
     * live document's, which is what keeps a restorable version's images alive
     * after the cards using them are gone.
     */
    assetHashes: string[];
    /** Set when a board's cards blob wouldn't parse at write time, so this
     *  snapshot's references are unknown. GC then deletes nothing at all, the
     *  same fail-safe as the Worker's `__unparsed__` marker. */
    assetsUnparsed?: boolean;
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

    // File binding (desktop only) — see the fields on CachedProject.
    /**
     * Bind a project to a `.scriptio` file, clearing any previous write record.
     * `fingerprint` seeds "how the file looked when we took it over" for a path
     * that already exists, so the first write can tell it apart from one another
     * program has since touched.
     */
    bindProjectFile(id: string, path: string, fingerprint?: FileFingerprint): Promise<void>;
    /** Forget a project's file binding entirely. */
    unbindProjectFile(id: string): Promise<void>;
    /** Record a successful write: the state vector written, and how the file now looks. */
    recordFileWrite(id: string, sv: Uint8Array, fingerprint?: FileFingerprint): Promise<void>;

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

    // Snapshots: device-local version history (local-only projects; cloud
    // projects keep their history in R2). Metadata and bytes are separate
    // stores, so listing a history never decodes it.
    putSnapshot(meta: SnapshotMeta, data: ArrayBuffer): Promise<void>;
    /** Every snapshot of a project, metadata only, newest first. */
    listSnapshots(projectId: string): Promise<SnapshotMeta[]>;
    /** The stored Yjs update for one snapshot, or null if it's gone. */
    getSnapshotData(key: string): Promise<ArrayBuffer | null>;
    /** Rename a manual save. A plain field update — unlike R2, nothing re-keys. */
    renameSnapshot(key: string, name: string): Promise<void>;
    /** Delete snapshots by key, metadata and bytes together. */
    deleteSnapshots(keys: string[]): Promise<void>;
    /** Remove a project's entire history (called on project deletion). */
    deleteProjectSnapshots(projectId: string): Promise<void>;

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
