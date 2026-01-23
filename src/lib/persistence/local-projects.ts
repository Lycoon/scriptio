/**
 * Local projects persistence for desktop app.
 * Stores project metadata in SQLite for offline-first functionality.
 * These projects exist only locally until synced to the cloud.
 *
 * IMPORTANT: All exported functions are guarded to return safe defaults
 * when not running in Tauri. This prevents SQLite errors in the browser.
 */

import { isTauri } from "@tauri-apps/api/core";

const DB_NAME = "sqlite:scriptio.db";

// Use any for database type to avoid TypeScript issues with Tauri plugin types
type Database = any;

export interface LocalProject {
    id: string;
    title: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    // Local-only projects don't have posters stored in S3
    // Could add local poster path in future if needed
}

let dbInstance: Database | null = null;
let initPromise: Promise<Database> | null = null;

/**
 * Initialize the database connection and create table if needed.
 * Uses singleton pattern to avoid multiple connections.
 * Only call this from within guarded functions.
 */
async function getDb(): Promise<Database> {
    if (!isTauri()) {
        throw new Error("SQLite is only available in Tauri environment");
    }

    if (dbInstance) return dbInstance;

    if (initPromise) return initPromise;

    initPromise = (async () => {
        const Database = (await import("@tauri-apps/plugin-sql")).default;
        const db = await Database.load(DB_NAME);

        // Create local_projects table if it doesn't exist
        await db.execute(`
            CREATE TABLE IF NOT EXISTS local_projects (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        `);

        dbInstance = db;
        return db;
    })();

    return initPromise;
}

/**
 * Generate a UUID for local projects.
 * Uses standard UUID format so projects can sync to cloud later.
 */
export function generateLocalProjectId(): string {
    return crypto.randomUUID();
}

/**
 * Check if a project exists in local SQLite storage.
 * Returns false when not in Tauri environment.
 */
export async function isLocalProject(projectId: string): Promise<boolean> {
    if (!isTauri()) return false;
    return localProjectExists(projectId);
}

/**
 * Create a new local project.
 * Throws error if not in Tauri environment.
 */
export async function createLocalProject(title: string, description?: string): Promise<LocalProject> {
    if (!isTauri()) {
        throw new Error("Cannot create local project outside Tauri environment");
    }

    const db = await getDb();
    const now = Date.now();
    const id = generateLocalProjectId();

    await db.execute(
        `INSERT INTO local_projects (id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [id, title, description || null, now, now]
    );

    return {
        id,
        title,
        description: description || null,
        createdAt: new Date(now),
        updatedAt: new Date(now),
    };
}

/**
 * Get all local projects.
 * Returns empty array when not in Tauri environment.
 */
export async function getLocalProjects(): Promise<LocalProject[]> {
    if (!isTauri()) return [];

    const db = await getDb();

    const results = await db.select("SELECT * FROM local_projects ORDER BY updated_at DESC") as {
        id: string;
        title: string;
        description: string | null;
        created_at: number;
        updated_at: number;
    }[];

    return results.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    }));
}

/**
 * Get a single local project by ID.
 * Returns null when not in Tauri environment.
 */
export async function getLocalProject(id: string): Promise<LocalProject | null> {
    if (!isTauri()) return null;

    const db = await getDb();

    const results = await db.select("SELECT * FROM local_projects WHERE id = ?", [id]) as {
        id: string;
        title: string;
        description: string | null;
        created_at: number;
        updated_at: number;
    }[];

    if (results.length === 0) return null;

    const row = results[0];
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    };
}

/**
 * Update a local project's metadata.
 * No-op when not in Tauri environment.
 */
export async function updateLocalProject(
    id: string,
    updates: { title?: string; description?: string }
): Promise<void> {
    if (!isTauri()) return;

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

    values.push(id);

    await db.execute(
        `UPDATE local_projects SET ${setClauses.join(", ")} WHERE id = ?`,
        values
    );
}

/**
 * Update the updated_at timestamp for a local project.
 * Called when the project content changes.
 * No-op when not in Tauri environment.
 */
export async function touchLocalProject(id: string): Promise<void> {
    if (!isTauri()) return;

    const db = await getDb();
    const now = Date.now();

    await db.execute(
        `UPDATE local_projects SET updated_at = ? WHERE id = ?`,
        [now, id]
    );
}

/**
 * Delete a local project (metadata only - Yjs doc cleanup handled separately).
 * No-op when not in Tauri environment.
 */
export async function deleteLocalProject(id: string): Promise<void> {
    if (!isTauri()) return;

    const db = await getDb();
    await db.execute("DELETE FROM local_projects WHERE id = ?", [id]);
}

/**
 * Check if a local project exists.
 * Returns false when not in Tauri environment.
 */
export async function localProjectExists(id: string): Promise<boolean> {
    if (!isTauri()) return false;

    const db = await getDb();
    const results = await db.select(
        "SELECT COUNT(*) as count FROM local_projects WHERE id = ?",
        [id]
    ) as { count: number }[];
    return results[0].count > 0;
}
