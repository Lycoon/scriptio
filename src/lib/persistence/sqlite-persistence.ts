/**
 * SQLite persistence provider for Yjs documents in Tauri desktop app.
 * This replaces y-indexeddb for more reliable local storage on desktop.
 *
 * Storage location (managed by Tauri, based on app identifier "ArkoLogic.Scriptio"):
 * - Windows: %APPDATA%\ArkoLogic.Scriptio\
 * - macOS: ~/Library/Application Support/ArkoLogic.Scriptio/
 * - Linux: ~/.local/share/arkologic.scriptio/
 *
 * For store distribution (Microsoft Store/Mac App Store), the paths are automatically
 * virtualized/sandboxed by the OS, and Tauri's path APIs handle this correctly.
 *
 * Note: We use Base64 encoding for binary data because Tauri's SQL plugin
 * has issues with Uint8Array serialization (see: https://github.com/tauri-apps/plugins-workspace/issues/105)
 */

import * as Y from "yjs";
import { Observable } from "lib0/observable";

// Base64 encoding/decoding utilities
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

const DB_NAME = "sqlite:scriptio.db";

// Use any for database type to avoid TypeScript issues with Tauri plugin types
type Database = any;

/**
 * SQLite persistence provider for Yjs documents.
 * Compatible with the same interface as IndexeddbPersistence from y-indexeddb.
 */
export class SqlitePersistence extends Observable<string> {
    private doc: Y.Doc;
    private projectId: string;
    private db: Database | null = null;
    private isInitialized = false;
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;
    private isSynced = false;

    // Debounce saves to avoid excessive writes
    private readonly SAVE_DEBOUNCE_MS = 1000;

    constructor(projectId: string, doc: Y.Doc) {
        super();
        this.projectId = projectId;
        this.doc = doc;

        this.init();
    }

    private async init(): Promise<void> {
        try {
            // Dynamically import to avoid SSR issues
            const Database = (await import("@tauri-apps/plugin-sql")).default;
            this.db = await Database.load(DB_NAME);

            // Load existing document state from local_projects table
            const result = await this.db.select(
                "SELECT data FROM local_projects WHERE id = ?",
                [this.projectId],
            ) as { data: string | null }[];

            if (result.length > 0 && result[0].data) {
                try {
                    const update = base64ToUint8Array(result[0].data);
                    Y.applyUpdate(this.doc, update);
                    console.log(`[SqlitePersistence] Loaded ${update.length} bytes for project ${this.projectId}`);
                } catch (updateError) {
                    console.warn(
                        `[SqlitePersistence] Corrupted data for project ${this.projectId}, clearing local cache:`,
                        updateError,
                    );
                    await this.db.execute("UPDATE local_projects SET data = NULL WHERE id = ?", [this.projectId]);
                    console.log(`[SqlitePersistence] Cleared corrupted data, will sync from cloud`);
                }
            } else {
                console.log(`[SqlitePersistence] No existing data for project ${this.projectId}`);
            }

            this.isInitialized = true;
            this.isSynced = true;

            this.doc.on("update", this.onDocumentUpdate); // Listen for document updates
            this.emit("synced", [this]); // Emit synced event (compatible with y-indexeddb)
        } catch (error) {
            console.error("[SqlitePersistence] Initialization failed:", error);
            // Still emit synced to not block the app, but with empty state
            this.isSynced = true;
            this.emit("synced", [this]);
        }
    }

    private onDocumentUpdate = (_update: Uint8Array, origin: any): void => {
        // Don't save updates that originated from loading
        if (origin === this) return;

        this.scheduleSave();
    };

    private scheduleSave(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = setTimeout(() => {
            this.saveToDatabase();
        }, this.SAVE_DEBOUNCE_MS);
    }

    private async saveToDatabase(): Promise<void> {
        if (!this.db || !this.isInitialized) return;

        try {
            const state = Y.encodeStateAsUpdate(this.doc);
            const base64Data = uint8ArrayToBase64(state);

            await this.db.execute(
                `UPDATE local_projects SET data = ?, updated_at = ? WHERE id = ?`,
                [base64Data, Date.now(), this.projectId],
            );

            console.log(`[SqlitePersistence] Saved ${state.length} bytes for project ${this.projectId}`);
        } catch (error) {
            console.error("[SqlitePersistence] Save failed:", error);
        }
    }

    /**
     * Check if the persistence provider has synced with local storage
     */
    get synced(): boolean {
        return this.isSynced;
    }

    /**
     * Force an immediate save
     */
    async flush(): Promise<void> {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        await this.saveToDatabase();
    }

    /**
     * Clear all data for this project
     */
    async clearData(): Promise<void> {
        if (!this.db) return;

        try {
            await this.db.execute("UPDATE local_projects SET data = NULL WHERE id = ?", [this.projectId]);
            console.log(`[SqlitePersistence] Cleared data for project ${this.projectId}`);
        } catch (error) {
            console.error("[SqlitePersistence] Clear failed:", error);
        }
    }

    /**
     * Destroy the persistence provider and clean up resources
     */
    destroy(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }

        this.doc.off("update", this.onDocumentUpdate);

        // Flush any pending saves before destroying
        if (this.db && this.isInitialized) {
            this.saveToDatabase().catch(console.error);
        }

        this.db = null;
        this.isInitialized = false;

        console.log(`[SqlitePersistence] Destroyed for project ${this.projectId}`);
    }
}
