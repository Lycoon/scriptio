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

export interface StorageProvider {
    // Project CRUD
    createProject(id: string, title: string, description?: string, synced?: boolean, author?: string): Promise<void>;
    getAll(): Promise<CachedProject[]>;
    get(id: string): Promise<CachedProject | null>;
    update(id: string, updates: { title?: string; description?: string; author?: string }): Promise<void>;
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
