import type { InstalledDictionary } from "./spellcheck-types";

// ---- Interface ----

export interface DictionaryStore {
    saveDictionary(code: string, aff: Uint8Array, dic: Uint8Array): Promise<void>;
    loadDictionary(code: string): Promise<{ aff: Uint8Array; dic: Uint8Array } | null>;
    deleteDictionary(code: string): Promise<void>;
    listInstalled(): Promise<InstalledDictionary[]>;
}

// ---- IndexedDB implementation (browser) ----

const IDB_NAME = "scriptio-dictionaries";
const IDB_STORE = "dictionaries";
const IDB_VERSION = 1;

function openIDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_NAME, IDB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE, { keyPath: "code" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function idbTransaction<T>(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, mode);
        const store = tx.objectStore(IDB_STORE);
        const request = fn(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

class IndexedDBDictionaryStore implements DictionaryStore {
    async saveDictionary(code: string, aff: Uint8Array, dic: Uint8Array): Promise<void> {
        const db = await openIDB();
        await idbTransaction(db, "readwrite", (store) =>
            store.put({
                code,
                aff,
                dic,
                size: aff.byteLength + dic.byteLength,
                installedAt: Date.now(),
            }),
        );
        db.close();
    }

    async loadDictionary(code: string): Promise<{ aff: Uint8Array; dic: Uint8Array } | null> {
        const db = await openIDB();
        const result = await idbTransaction(db, "readonly", (store) => store.get(code));
        db.close();
        if (!result) return null;
        return { aff: result.aff, dic: result.dic };
    }

    async deleteDictionary(code: string): Promise<void> {
        const db = await openIDB();
        await idbTransaction(db, "readwrite", (store) => store.delete(code));
        db.close();
    }

    async listInstalled(): Promise<InstalledDictionary[]> {
        const db = await openIDB();
        const all = await idbTransaction(db, "readonly", (store) => store.getAll());
        db.close();
        return (all as any[]).map((row) => ({
            code: row.code,
            size: row.size,
            installedAt: row.installedAt,
        }));
    }
}

// ---- SQLite implementation (Tauri desktop) ----

// Base64 encoding/decoding matching sqlite-persistence.ts pattern
function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

class SqliteDictionaryStore implements DictionaryStore {
    private async db() {
        const { getDb } = await import("../persistence/local-projects");
        return getDb();
    }

    async saveDictionary(code: string, aff: Uint8Array, dic: Uint8Array): Promise<void> {
        const db = await this.db();
        const size = aff.byteLength + dic.byteLength;
        await db.execute(
            `INSERT OR REPLACE INTO dictionaries (code, aff_data, dic_data, size, installed_at) VALUES (?, ?, ?, ?, ?)`,
            [code, uint8ArrayToBase64(aff), uint8ArrayToBase64(dic), size, Date.now()],
        );
    }

    async loadDictionary(code: string): Promise<{ aff: Uint8Array; dic: Uint8Array } | null> {
        const db = await this.db();
        const results = (await db.select("SELECT aff_data, dic_data FROM dictionaries WHERE code = ?", [code])) as {
            aff_data: string;
            dic_data: string;
        }[];
        if (results.length === 0) return null;
        return {
            aff: base64ToUint8Array(results[0].aff_data),
            dic: base64ToUint8Array(results[0].dic_data),
        };
    }

    async deleteDictionary(code: string): Promise<void> {
        const db = await this.db();
        await db.execute("DELETE FROM dictionaries WHERE code = ?", [code]);
    }

    async listInstalled(): Promise<InstalledDictionary[]> {
        const db = await this.db();
        const results = (await db.select("SELECT code, size, installed_at FROM dictionaries")) as {
            code: string;
            size: number;
            installed_at: number;
        }[];
        return results.map((row) => ({
            code: row.code,
            size: row.size,
            installedAt: row.installed_at,
        }));
    }
}

// ---- Factory ----

export async function getDictionaryStore(): Promise<DictionaryStore> {
    const { isTauri } = await import("@tauri-apps/api/core");
    if (isTauri()) {
        return new SqliteDictionaryStore();
    }
    return new IndexedDBDictionaryStore();
}
