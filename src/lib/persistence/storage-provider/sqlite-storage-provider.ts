/**
 * SQLite storage provider for Tauri desktop environments.
 * Stores project metadata and settings in a local SQLite database.
 *
 * Storage location (managed by Tauri, based on app identifier "ArkoLogic.Scriptio"):
 * - Windows: %APPDATA%\ArkoLogic.Scriptio\
 * - macOS: ~/Library/Application Support/ArkoLogic.Scriptio/
 * - Linux: ~/.local/share/arkologic.scriptio/
 */

import type { InstalledDictionary, UserSettings } from "@src/lib/utils/types";
import { CachedProject, ProjectEntryInput, StorageProvider } from "./storage-provider";

function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

const DB_NAME = "sqlite:scriptio.db";
const SETTINGS_KEY = "global";

// Use any for database type to avoid TypeScript issues with Tauri plugin types
type Database = any;

let dbInstance: Database | null = null;
let initPromise: Promise<Database> | null = null;

/**
 * Initialize the database connection and create tables if needed.
 * Uses singleton pattern to avoid multiple connections.
 * Exported so other modules (e.g. dictionary store) can reuse the same connection.
 */
export async function getDb(): Promise<Database> {
    if (dbInstance) return dbInstance;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const Database = (await import("@tauri-apps/plugin-sql")).default;
        const db = await Database.load(DB_NAME);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS cached_projects (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                author TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                is_synced INTEGER NOT NULL DEFAULT 0,
                data TEXT
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS dictionaries (
                code TEXT PRIMARY KEY,
                aff_data TEXT NOT NULL,
                dic_data TEXT NOT NULL,
                size INTEGER NOT NULL,
                installed_at INTEGER NOT NULL
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        `);

        dbInstance = db;
        return db;
    })();

    return initPromise;
}

// ── StorageProvider implementation ───────────────────────────────────────────

export class SqliteStorageProvider implements StorageProvider {
    async createProject(
        id: string,
        title: string,
        description?: string,
        synced: boolean = false,
        author?: string,
    ): Promise<void> {
        const db = await getDb();
        const now = Date.now();
        await db.execute(
            `INSERT INTO cached_projects (id, title, description, author, created_at, updated_at, is_synced) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, title, description || null, author || null, now, now, synced ? 1 : 0],
        );
    }

    async getAll(): Promise<CachedProject[]> {
        const db = await getDb();
        const results = (await db.select("SELECT * FROM cached_projects ORDER BY updated_at DESC")) as {
            id: string;
            title: string;
            description: string | null;
            author: string | null;
            created_at: number;
            updated_at: number;
            is_synced: number;
        }[];

        return results.map((row) => ({
            id: row.id,
            title: row.title,
            description: row.description,
            author: row.author,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
            isLocalOnly: row.is_synced === 0,
        }));
    }

    async get(id: string): Promise<CachedProject | null> {
        const db = await getDb();
        const results = (await db.select("SELECT * FROM cached_projects WHERE id = ?", [id])) as {
            id: string;
            title: string;
            description: string | null;
            author: string | null;
            created_at: number;
            updated_at: number;
            is_synced: number;
        }[];

        if (results.length === 0) return null;

        const row = results[0];
        return {
            id: row.id,
            title: row.title,
            description: row.description,
            author: row.author,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
            isLocalOnly: row.is_synced === 0,
        };
    }

    async update(id: string, updates: { title?: string; description?: string; author?: string }): Promise<void> {
        const db = await getDb();
        const now = Date.now();

        const setClauses: string[] = ["updated_at = ?"];
        const values: (string | number | null)[] = [now];

        if (updates.title !== undefined) {
            setClauses.push("title = ?");
            values.push(updates.title);
        }
        if (updates.description !== undefined) {
            setClauses.push("description = ?");
            values.push(updates.description);
        }
        if (updates.author !== undefined) {
            setClauses.push("author = ?");
            values.push(updates.author);
        }

        values.push(id);
        await db.execute(`UPDATE cached_projects SET ${setClauses.join(", ")} WHERE id = ?`, values);
    }

    async touch(id: string): Promise<void> {
        const db = await getDb();
        await db.execute(`UPDATE cached_projects SET updated_at = ? WHERE id = ?`, [Date.now(), id]);
    }

    async delete(id: string): Promise<void> {
        const db = await getDb();
        await db.execute("DELETE FROM cached_projects WHERE id = ?", [id]);
    }

    async exists(id: string): Promise<boolean> {
        const db = await getDb();
        const results = (await db.select("SELECT COUNT(*) as count FROM cached_projects WHERE id = ?", [id])) as {
            count: number;
        }[];
        return results[0].count > 0;
    }

    async ensureEntries(projects: ProjectEntryInput[]): Promise<void> {
        const db = await getDb();
        for (const p of projects) {
            await db.execute(
                `INSERT OR IGNORE INTO cached_projects (id, title, description, author, created_at, updated_at, is_synced) VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [p.id, p.title, p.description, p.author || null, p.createdAt.getTime(), p.updatedAt.getTime()],
            );
        }
    }

    async getSettings(): Promise<Partial<UserSettings>> {
        const db = await getDb();
        const rows = (await db.select("SELECT value FROM settings WHERE key = ?", [SETTINGS_KEY])) as {
            value: string;
        }[];
        if (rows.length === 0) return {};
        try {
            return JSON.parse(rows[0].value);
        } catch {
            return {};
        }
    }

    async saveSettings(updates: Partial<UserSettings>): Promise<void> {
        const current = await this.getSettings();
        const merged = { ...current, ...updates };
        const db = await getDb();
        await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
            SETTINGS_KEY,
            JSON.stringify(merged),
        ]);
    }

    async saveDictionary(code: string, aff: Uint8Array, dic: Uint8Array): Promise<void> {
        const db = await getDb();
        await db.execute(
            `INSERT OR REPLACE INTO dictionaries (code, aff_data, dic_data, size, installed_at) VALUES (?, ?, ?, ?, ?)`,
            [code, uint8ArrayToBase64(aff), uint8ArrayToBase64(dic), aff.byteLength + dic.byteLength, Date.now()],
        );
    }

    async loadDictionary(code: string): Promise<{ aff: Uint8Array; dic: Uint8Array } | null> {
        const db = await getDb();
        const results = (await db.select("SELECT aff_data, dic_data FROM dictionaries WHERE code = ?", [code])) as {
            aff_data: string;
            dic_data: string;
        }[];
        if (results.length === 0) return null;
        return { aff: base64ToUint8Array(results[0].aff_data), dic: base64ToUint8Array(results[0].dic_data) };
    }

    async deleteDictionary(code: string): Promise<void> {
        const db = await getDb();
        await db.execute("DELETE FROM dictionaries WHERE code = ?", [code]);
    }

    async listInstalledDictionaries(): Promise<InstalledDictionary[]> {
        const db = await getDb();
        const results = (await db.select("SELECT code, size, installed_at FROM dictionaries")) as {
            code: string;
            size: number;
            installed_at: number;
        }[];
        return results.map((row) => ({
            code: row.code as InstalledDictionary["code"],
            size: row.size,
            installedAt: row.installed_at,
        }));
    }
}

// ── Desktop-only utilities ───────────────────────────────────────────────────

/**
 * Migrate a cloud project to a new local project.
 * Creates a new local project entry and copies the document data.
 * Only available on desktop (Tauri).
 */
export async function migrateToCachedProject(
    oldProjectId: string,
    title: string,
    description?: string,
): Promise<CachedProject> {
    const db = await getDb();

    const result = (await db.select("SELECT data FROM cached_projects WHERE id = ?", [oldProjectId])) as {
        data: string | null;
    }[];

    const id = crypto.randomUUID();
    const now = Date.now();
    await db.execute(
        `INSERT INTO cached_projects (id, title, description, author, created_at, updated_at, is_synced) VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [id, title, description || null, null, now, now],
    );

    if (result.length > 0 && result[0].data) {
        await db.execute("UPDATE cached_projects SET data = ?, updated_at = ? WHERE id = ?", [
            result[0].data,
            Date.now(),
            id,
        ]);
    }

    await db.execute("DELETE FROM cached_projects WHERE id = ?", [oldProjectId]);

    return {
        id,
        title,
        description: description || null,
        author: null,
        createdAt: new Date(now),
        updatedAt: new Date(now),
        isLocalOnly: true,
    };
}

/**
 * Discard a cloud project's local data.
 * Only available on desktop (Tauri).
 */
export async function discardCloudProjectData(projectId: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM cached_projects WHERE id = ?", [projectId]);
}
