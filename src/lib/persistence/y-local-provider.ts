/**
 * Shared factory for local Yjs persistence providers.
 * Picks the right implementation based on environment:
 *   - Browser: y-indexeddb (one DB per project, keyed as "scriptio-<projectId>")
 *   - Desktop (Tauri): SQLitePersistence (data column in cached_projects table)
 *
 * Centralises the isTauri() branch so project-state.ts and import-project.ts
 * don't duplicate the same switching logic.
 */

import type * as Y from "yjs";

/** The IndexedDB database name used for a project's Yjs document. */
export const yjsDbKey = (projectId: string) => `scriptio-${projectId}`;

export interface YjsLocalProvider {
    on(event: "synced", callback: (provider: any) => void): void;
    destroy(): void;
    /** Force an immediate write (available on SQLitePersistence, no-op on IndexedDB). */
    flush?(): Promise<void>;
    /** Clear all stored data for this project (used when server restores a snapshot). */
    clearData?(): Promise<void>;
}

/**
 * Create the appropriate local Yjs persistence provider for the current environment.
 * The provider is returned before sync completes — attach to the "synced" event.
 */
export async function createLocalYjsProvider(projectId: string, ydoc: Y.Doc): Promise<YjsLocalProvider> {
    const { isTauri } = await import("@tauri-apps/api/core");
    if (isTauri()) {
        const { SQLitePersistence } = await import("./y-sqlite");
        return new SQLitePersistence(projectId, ydoc);
    } else {
        const { IndexeddbPersistence } = await import("y-indexeddb");
        return new IndexeddbPersistence(yjsDbKey(projectId), ydoc);
    }
}

/**
 * Write a Yjs document to local persistence once, then destroy the provider.
 * Used during project creation/import where we populate the doc and don't need
 * the provider to stay alive.
 */
export async function writeYjsDocumentLocally(projectId: string, ydoc: Y.Doc): Promise<void> {
    const provider = await createLocalYjsProvider(projectId, ydoc);

    await new Promise<void>((resolve) => {
        provider.on("synced", () => resolve());
    });

    if (provider.flush) {
        await provider.flush();
    } else {
        // Give IndexedDB time to finish writing
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    provider.destroy();
}
