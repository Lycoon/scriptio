/**
 * IndexedDB storage provider for browser environments.
 * Stores project metadata and settings in IndexedDB.
 *
 * Schema versioning is delegated to the migrations/ module; bumping
 * CURRENT_STORE_VERSION there is what triggers `onupgradeneeded`.
 */

import type { InstalledDictionary, UserSettings } from "@src/lib/utils/types";
import { CachedProject, ProjectEntryInput, StorageProvider, StoredAsset } from "./storage-provider";
import {
    ASSETS_BY_PROJECT_INDEX,
    CURRENT_STORE_VERSION,
    STORE_NAMES,
} from "./migrations/store-migrations";
import { runStoreMigrations } from "./migrations/store-migration-runner";
import { StoreVersionTooNewError } from "./migrations/errors";

const BROWSER_DB_NAME = "scriptio-local";
const PROJECTS_STORE = STORE_NAMES.PROJECTS;
const SETTINGS_STORE = STORE_NAMES.SETTINGS;
const DICTIONARIES_STORE = STORE_NAMES.DICTIONARIES;
const MIGRATION_BACKUPS_STORE = STORE_NAMES.MIGRATION_BACKUPS;
const ASSETS_STORE = STORE_NAMES.ASSETS;
const SETTINGS_KEY = "global";

/** Primary key for an asset record: `${projectId}/${hash}`. */
const assetKey = (projectId: string, hash: string): string => `${projectId}/${hash}`;

interface BrowserStoredProject {
    id: string;
    title: string;
    description: string | null;
    author: string | null;
    createdAt: number;
    updatedAt: number;
    is_synced: number; // 0 = local-only, 1 = cloud-synced
}

interface MigrationBackupRecord {
    projectId: string;
    snapshot: Uint8Array;
    fromVersion: number;
    createdAt: number;
}

let browserDbInstance: IDBDatabase | null = null;

async function getBrowserDb(): Promise<IDBDatabase> {
    if (browserDbInstance) return browserDbInstance;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(BROWSER_DB_NAME, CURRENT_STORE_VERSION);
        // Holds a migration error from inside onupgradeneeded so onerror can surface it
        // instead of the generic AbortError that fires when we manually abort the tx.
        let upgradeError: unknown = null;

        request.onupgradeneeded = (event) => {
            const req = event.target as IDBOpenDBRequest;
            const tx = req.transaction;
            if (!tx) {
                upgradeError = new Error("upgrade transaction missing");
                return;
            }
            try {
                runStoreMigrations({
                    db: req.result,
                    tx,
                    oldVersion: event.oldVersion,
                    newVersion: event.newVersion ?? CURRENT_STORE_VERSION,
                });
            } catch (err) {
                upgradeError = err;
                tx.abort();
            }
        };

        request.onsuccess = () => {
            browserDbInstance = request.result;
            resolve(browserDbInstance);
        };
        request.onerror = () => {
            if (upgradeError) {
                reject(upgradeError);
                return;
            }
            const err = request.error;
            // VersionError fires when the on-disk DB has a higher version than
            // what we're requesting (user installed a newer build, then downgraded).
            if (err && err.name === "VersionError") {
                reject(new StoreVersionTooNewError(0, CURRENT_STORE_VERSION));
            } else {
                reject(err);
            }
        };
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

    async markAsSynced(id: string): Promise<void> {
        const existing = await idbGet(id);
        if (!existing) return;
        await idbPut({ ...existing, is_synced: 1, updatedAt: Date.now() });
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

    async saveMigrationBackup(projectId: string, snapshot: Uint8Array, fromVersion: number): Promise<void> {
        const db = await getBrowserDb();
        const record: MigrationBackupRecord = {
            projectId,
            snapshot,
            fromVersion,
            createdAt: Date.now(),
        };
        return new Promise((resolve, reject) => {
            const tx = db.transaction(MIGRATION_BACKUPS_STORE, "readwrite");
            tx.objectStore(MIGRATION_BACKUPS_STORE).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async loadMigrationBackup(projectId: string): Promise<{ snapshot: Uint8Array; fromVersion: number } | null> {
        const db = await getBrowserDb();
        return new Promise((resolve, reject) => {
            const req = db
                .transaction(MIGRATION_BACKUPS_STORE, "readonly")
                .objectStore(MIGRATION_BACKUPS_STORE)
                .get(projectId);
            req.onsuccess = () => {
                const result = req.result as MigrationBackupRecord | undefined;
                resolve(result ? { snapshot: result.snapshot, fromVersion: result.fromVersion } : null);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async clearMigrationBackup(projectId: string): Promise<void> {
        const db = await getBrowserDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(MIGRATION_BACKUPS_STORE, "readwrite");
            tx.objectStore(MIGRATION_BACKUPS_STORE).delete(projectId);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // ── Assets ────────────────────────────────────────────────────────────────

    async putAsset(asset: StoredAsset): Promise<void> {
        const db = await getBrowserDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(ASSETS_STORE, "readwrite");
            tx.objectStore(ASSETS_STORE).put(asset);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async hasAsset(projectId: string, hash: string): Promise<boolean> {
        const db = await getBrowserDb();
        return new Promise((resolve, reject) => {
            const req = db
                .transaction(ASSETS_STORE, "readonly")
                .objectStore(ASSETS_STORE)
                .getKey(assetKey(projectId, hash));
            req.onsuccess = () => resolve(req.result !== undefined);
            req.onerror = () => reject(req.error);
        });
    }

    async getAsset(projectId: string, hash: string): Promise<StoredAsset | null> {
        const db = await getBrowserDb();
        return new Promise((resolve, reject) => {
            const req = db
                .transaction(ASSETS_STORE, "readonly")
                .objectStore(ASSETS_STORE)
                .get(assetKey(projectId, hash));
            req.onsuccess = () => resolve((req.result as StoredAsset | undefined) ?? null);
            req.onerror = () => reject(req.error);
        });
    }

    async listAssetHashes(projectId: string): Promise<string[]> {
        const db = await getBrowserDb();
        return new Promise((resolve, reject) => {
            const hashes: string[] = [];
            const index = db
                .transaction(ASSETS_STORE, "readonly")
                .objectStore(ASSETS_STORE)
                .index(ASSETS_BY_PROJECT_INDEX);
            const req = index.openCursor(IDBKeyRange.only(projectId));
            req.onsuccess = () => {
                const cursor = req.result;
                if (cursor) {
                    hashes.push((cursor.value as StoredAsset).hash);
                    cursor.continue();
                } else {
                    resolve(hashes);
                }
            };
            req.onerror = () => reject(req.error);
        });
    }

    async deleteAsset(projectId: string, hash: string): Promise<void> {
        const db = await getBrowserDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(ASSETS_STORE, "readwrite");
            tx.objectStore(ASSETS_STORE).delete(assetKey(projectId, hash));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async deleteProjectAssets(projectId: string): Promise<void> {
        const db = await getBrowserDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(ASSETS_STORE, "readwrite");
            const store = tx.objectStore(ASSETS_STORE);
            const req = store.index(ASSETS_BY_PROJECT_INDEX).openCursor(IDBKeyRange.only(projectId));
            req.onsuccess = () => {
                const cursor = req.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async copyProjectAssets(fromProjectId: string, toProjectId: string): Promise<void> {
        const db = await getBrowserDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(ASSETS_STORE, "readwrite");
            const store = tx.objectStore(ASSETS_STORE);
            const req = store.index(ASSETS_BY_PROJECT_INDEX).openCursor(IDBKeyRange.only(fromProjectId));
            req.onsuccess = () => {
                const cursor = req.result;
                if (cursor) {
                    const src = cursor.value as StoredAsset;
                    store.put({
                        ...src,
                        key: assetKey(toProjectId, src.hash),
                        projectId: toProjectId,
                    });
                    cursor.continue();
                }
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }
}
