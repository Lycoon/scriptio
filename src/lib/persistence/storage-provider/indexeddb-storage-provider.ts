/**
 * IndexedDB storage provider for browser environments.
 * Stores project metadata and settings in IndexedDB.
 */

import type { InstalledDictionary, UserSettings } from "@src/lib/utils/types";
import { CachedProject, ProjectEntryInput, StorageProvider } from "./storage-provider";

const BROWSER_DB_NAME = "scriptio-local";
const BROWSER_DB_VERSION = 1;
const PROJECTS_STORE = "cached_projects";
const SETTINGS_STORE = "settings";
const DICTIONARIES_STORE = "dictionaries";
const SETTINGS_KEY = "global";

interface BrowserStoredProject {
    id: string;
    title: string;
    description: string | null;
    author: string | null;
    createdAt: number;
    updatedAt: number;
    is_synced: number; // 0 = local-only, 1 = cloud-synced
}

let browserDbInstance: IDBDatabase | null = null;

async function getBrowserDb(): Promise<IDBDatabase> {
    if (browserDbInstance) return browserDbInstance;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(BROWSER_DB_NAME, BROWSER_DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
                db.createObjectStore(PROJECTS_STORE, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
                db.createObjectStore(SETTINGS_STORE);
            }
            if (!db.objectStoreNames.contains(DICTIONARIES_STORE)) {
                db.createObjectStore(DICTIONARIES_STORE, { keyPath: "code" });
            }
        };

        request.onsuccess = () => {
            browserDbInstance = request.result;
            resolve(browserDbInstance);
        };
        request.onerror = () => reject(request.error);
    });
}

// ── Low-level helpers ────────────────────────────────────────────────────────

async function idbGetAll(): Promise<BrowserStoredProject[]> {
    const db = await getBrowserDb();
    return new Promise((resolve, reject) => {
        const request = db.transaction(PROJECTS_STORE, "readonly").objectStore(PROJECTS_STORE).getAll();
        request.onsuccess = () => {
            const results = request.result as BrowserStoredProject[];
            results.sort((a, b) => b.updatedAt - a.updatedAt);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
}

async function idbGet(id: string): Promise<BrowserStoredProject | null> {
    const db = await getBrowserDb();
    return new Promise((resolve, reject) => {
        const request = db.transaction(PROJECTS_STORE, "readonly").objectStore(PROJECTS_STORE).get(id);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
    });
}

async function idbPut(project: BrowserStoredProject): Promise<void> {
    const db = await getBrowserDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PROJECTS_STORE, "readwrite");
        tx.objectStore(PROJECTS_STORE).put(project);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function idbDelete(id: string): Promise<void> {
    const db = await getBrowserDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PROJECTS_STORE, "readwrite");
        tx.objectStore(PROJECTS_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function toCachedProject(p: BrowserStoredProject): CachedProject {
    return {
        id: p.id,
        title: p.title,
        description: p.description,
        author: p.author,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt),
        isLocalOnly: p.is_synced === 0,
    };
}

// ── StorageProvider implementation ───────────────────────────────────────────

export class IndexedDBStorageProvider implements StorageProvider {
    async createProject(
        id: string,
        title: string,
        description?: string,
        synced: boolean = false,
        author?: string,
    ): Promise<void> {
        const now = Date.now();
        await idbPut({
            id,
            title,
            description: description || null,
            author: author || null,
            createdAt: now,
            updatedAt: now,
            is_synced: synced ? 1 : 0,
        });
    }

    async getAll(): Promise<CachedProject[]> {
        return (await idbGetAll()).map(toCachedProject);
    }

    async get(id: string): Promise<CachedProject | null> {
        const found = await idbGet(id);
        return found ? toCachedProject(found) : null;
    }

    async update(id: string, updates: { title?: string; description?: string; author?: string }): Promise<void> {
        const existing = await idbGet(id);
        if (!existing) return;
        await idbPut({
            ...existing,
            ...(updates.title !== undefined && { title: updates.title }),
            ...(updates.description !== undefined && { description: updates.description }),
            ...(updates.author !== undefined && { author: updates.author }),
            updatedAt: Date.now(),
        });
    }

    async touch(id: string): Promise<void> {
        const existing = await idbGet(id);
        if (existing) {
            await idbPut({ ...existing, updatedAt: Date.now() });
        }
    }

    async delete(id: string): Promise<void> {
        await idbDelete(id);
    }

    async exists(id: string): Promise<boolean> {
        return (await idbGet(id)) !== null;
    }

    async ensureEntries(projects: ProjectEntryInput[]): Promise<void> {
        for (const p of projects) {
            const existing = await idbGet(p.id);
            if (!existing) {
                await idbPut({
                    id: p.id,
                    title: p.title,
                    description: p.description,
                    author: p.author || null,
                    createdAt: p.createdAt.getTime(),
                    updatedAt: p.updatedAt.getTime(),
                    is_synced: 1,
                });
            }
        }
    }

    async getSettings(): Promise<Partial<UserSettings>> {
        const db = await getBrowserDb();
        return new Promise((resolve, reject) => {
            const req = db.transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE).get(SETTINGS_KEY);
            req.onsuccess = () => resolve(req.result ?? {});
            req.onerror = () => reject(req.error);
        });
    }

    async saveSettings(updates: Partial<UserSettings>): Promise<void> {
        const current = await this.getSettings();
        const merged = { ...current, ...updates };
        const db = await getBrowserDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(SETTINGS_STORE, "readwrite");
            tx.objectStore(SETTINGS_STORE).put(merged, SETTINGS_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async saveDictionary(code: string, aff: Uint8Array, dic: Uint8Array): Promise<void> {
        const db = await getBrowserDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DICTIONARIES_STORE, "readwrite");
            tx.objectStore(DICTIONARIES_STORE).put({
                code,
                aff,
                dic,
                size: aff.byteLength + dic.byteLength,
                installedAt: Date.now(),
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async loadDictionary(code: string): Promise<{ aff: Uint8Array; dic: Uint8Array } | null> {
        const db = await getBrowserDb();
        return new Promise((resolve, reject) => {
            const req = db.transaction(DICTIONARIES_STORE, "readonly").objectStore(DICTIONARIES_STORE).get(code);
            req.onsuccess = () => {
                const result = req.result;
                resolve(result ? { aff: result.aff, dic: result.dic } : null);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async deleteDictionary(code: string): Promise<void> {
        const db = await getBrowserDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DICTIONARIES_STORE, "readwrite");
            tx.objectStore(DICTIONARIES_STORE).delete(code);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async listInstalledDictionaries(): Promise<InstalledDictionary[]> {
        const db = await getBrowserDb();
        return new Promise((resolve, reject) => {
            const req = db.transaction(DICTIONARIES_STORE, "readonly").objectStore(DICTIONARIES_STORE).getAll();
            req.onsuccess = () =>
                resolve(
                    (req.result as InstalledDictionary[]).map((row) => ({
                        code: row.code,
                        size: row.size,
                        installedAt: row.installedAt,
                    })),
                );
            req.onerror = () => reject(req.error);
        });
    }
}
