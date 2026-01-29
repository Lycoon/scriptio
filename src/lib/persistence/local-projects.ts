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
                updated_at INTEGER NOT NULL,
                is_synced INTEGER NOT NULL DEFAULT 0,
                data TEXT
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
 * Create a new local-only project with a generated ID.
 * Throws error if not in Tauri environment.
 */
export async function createLocalProject(title: string, description?: string): Promise<LocalProject> {
    return createLocalProjectWithId(generateLocalProjectId(), title, description, false);
}

/**
 * Create a local project with a specific ID.
 * When synced is true, the project also exists on the server (cloud-synced).
 * Throws error if not in Tauri environment.
 */
export async function createLocalProjectWithId(
    id: string,
    title: string,
    description?: string,
    synced: boolean = false,
): Promise<LocalProject> {
    if (!isTauri()) {
        throw new Error("Cannot create local project outside Tauri environment");
    }

    const db = await getDb();
    const now = Date.now();

    await db.execute(
        `INSERT INTO local_projects (id, title, description, created_at, updated_at, is_synced) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, title, description || null, now, now, synced ? 1 : 0]
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
 * Delete a local project.
 * No-op when not in Tauri environment.
 */
export async function deleteLocalProject(id: string): Promise<void> {
    if (!isTauri()) return;

    const db = await getDb();
    await db.execute("DELETE FROM local_projects WHERE id = ?", [id]);
}

/**
 * Migrate a cloud project to a new local project.
 * Creates a new local project entry and copies the document data.
 * Cleans up the old project entry afterward.
 */
export async function migrateToLocalProject(
    oldProjectId: string,
    title: string,
    description?: string
): Promise<LocalProject> {
    if (!isTauri()) {
        throw new Error("Cannot migrate project outside Tauri environment");
    }

    const db = await getDb();

    // Read data from old project entry
    const result = await db.select(
        "SELECT data FROM local_projects WHERE id = ?",
        [oldProjectId]
    ) as { data: string | null }[];

    const newProject = await createLocalProject(title, description);

    // Copy Yjs data to new project entry
    if (result.length > 0 && result[0].data) {
        await db.execute(
            "UPDATE local_projects SET data = ?, updated_at = ? WHERE id = ?",
            [result[0].data, Date.now(), newProject.id]
        );
    }

    // Clean up old project entry
    await db.execute("DELETE FROM local_projects WHERE id = ?", [oldProjectId]);

    return newProject;
}

/**
 * Discard a cloud project's local data.
 * Used when the user chooses not to keep a local copy of a deleted cloud project.
 */
export async function discardCloudProjectData(projectId: string): Promise<void> {
    if (!isTauri()) return;
    const db = await getDb();
    await db.execute("DELETE FROM local_projects WHERE id = ?", [projectId]);
}

/**
 * Check if a project is local-only (not cloud-synced).
 * Returns false when not in Tauri environment or project doesn't exist locally.
 */
export async function isLocalOnlyProject(id: string): Promise<boolean> {
    if (!isTauri()) return false;

    const db = await getDb();
    const results = await db.select(
        "SELECT is_synced FROM local_projects WHERE id = ?",
        [id]
    ) as { is_synced: number }[];

    if (results.length === 0) return false;
    return results[0].is_synced === 0;
}

/**
 * Ensure remote projects have local entries for offline-first persistence.
 * Inserts any missing projects as cloud-synced (is_synced = 1).
 * No-op when not in Tauri environment.
 */
export async function ensureLocalEntries(
    projects: { id: string; title: string; description: string | null; createdAt: Date; updatedAt: Date }[],
): Promise<void> {
    if (!isTauri() || projects.length === 0) return;

    const db = await getDb();
    for (const p of projects) {
        await db.execute(
            `INSERT OR IGNORE INTO local_projects (id, title, description, created_at, updated_at, is_synced) VALUES (?, ?, ?, ?, ?, 1)`,
            [p.id, p.title, p.description, p.createdAt.getTime(), p.updatedAt.getTime()]
        );
    }
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
