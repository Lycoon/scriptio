/**
 * Shared factory for local Yjs persistence providers.
 * Uses y-indexeddb on both browser and desktop (one DB per project, keyed as "scriptio-<projectId>").
 */

import type * as Y from "yjs";

/** The IndexedDB database name used for a project's Yjs document. */
export const yjsDbKey = (projectId: string) => `scriptio-${projectId}`;

export interface YjsLocalProvider {
    on(event: "synced", callback: (provider: YjsLocalProvider) => void): void;
    destroy(): void;
    /** Clear all stored data for this project (used when server restores a snapshot). */
    clearData?(): Promise<void>;
}

/**
 * Create a local Yjs persistence provider backed by IndexedDB.
 * The provider is returned before sync completes — attach to the "synced" event.
 */
export async function createLocalYjsProvider(projectId: string, ydoc: Y.Doc): Promise<YjsLocalProvider> {
    const { IndexeddbPersistence } = await import("y-indexeddb");
    return new IndexeddbPersistence(yjsDbKey(projectId), ydoc);
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

    // Give IndexedDB time to finish writing
    await new Promise((resolve) => setTimeout(resolve, 100));

    provider.destroy();
}
