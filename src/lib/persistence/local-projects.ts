/**
 * Local projects persistence for desktop app.
 * Stores project metadata in SQLite for offline-first functionality.
 * These projects exist only locally until synced to the cloud.
 */

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
 */
async function getDb(): Promise<Database> {
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
 * Uses 'local-' prefix to distinguish from cloud projects.
 */
export function generateLocalProjectId(): string {
    const uuid = crypto.randomUUID();
    return `local-${uuid}`;
}

/**
 * Check if a project ID is a local-only project.
 */
export function isLocalProject(projectId: string): boolean {
    return projectId.startsWith("local-");
}

/**
 * Create a new local project.
 */
export async function createLocalProject(title: string, description?: string): Promise<LocalProject> {
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
 */
export async function getLocalProjects(): Promise<LocalProject[]> {
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
 */
export async function getLocalProject(id: string): Promise<LocalProject | null> {
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
 */
export async function updateLocalProject(
    id: string,
    updates: { title?: string; description?: string }
): Promise<void> {
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
 */
export async function touchLocalProject(id: string): Promise<void> {
    const db = await getDb();
    const now = Date.now();

    await db.execute(
        `UPDATE local_projects SET updated_at = ? WHERE id = ?`,
        [now, id]
    );
}

/**
 * Delete a local project (metadata only - Yjs doc cleanup handled separately).
 */
export async function deleteLocalProject(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM local_projects WHERE id = ?", [id]);
}

/**
 * Check if a local project exists.
 */
export async function localProjectExists(id: string): Promise<boolean> {
    const db = await getDb();
    const results = await db.select(
        "SELECT COUNT(*) as count FROM local_projects WHERE id = ?",
        [id]
    ) as { count: number }[];
    return results[0].count > 0;
}