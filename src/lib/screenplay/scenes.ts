"use client";

/**
 * scenes.ts
 *
 * Scene persistence using Yjs Y.Map storage.
 * Mirrors the character architecture for consistency.
 */

import { ProjectContextType } from "@src/context/ProjectContext";
import { getScenesMap } from "@src/lib/project/project-yjs";
import { v4 as uuidv4 } from "uuid";

// -------------------------------- //
//          TYPE DEFINITIONS        //
// -------------------------------- //

/**
 * Computed scene data from screenplay parsing.
 * These are transient and recalculated on every screenplay change.
 */
export type ComputedScene = {
    title: string;
    preview: string;
    position: number;
    nextPosition: number;
};

export type ComputedScenesData = ComputedScene[];

/**
 * Persistent scene metadata stored in Yjs.
 * These are user-editable and synced across collaborators.
 */
export type PersistentSceneItem = {
    id: string;
    synopsis?: string;
    color?: string;
};

/**
 * Merged scene data combining computed and persistent data.
 * This is what gets exposed to the UI.
 */
export type MergedSceneItem = ComputedScene & {
    id: string | null;
    synopsis?: string;
    color?: string;
    isPersistent: boolean;
};

export type MergedScenesData = MergedSceneItem[];

/**
 * Scene data for CRUD operations.
 */
export type SceneData = {
    title: string;
    position: number;
} & PersistentSceneItem;

// -------------------------------- //
//       SCENE IDENTIFICATION       //
// -------------------------------- //

/**
 * Generate a unique key for a scene based on title and position.
 * This handles duplicate headings (e.g., multiple "INT. OFFICE - DAY").
 */
export const getSceneKey = (title: string, position: number): string => {
    return `${title}::${position}`;
};

/**
 * Parse a scene key back to title and position.
 */
export const parseSceneKey = (key: string): { title: string; position: number } => {
    const lastSeparator = key.lastIndexOf("::");
    const title = key.substring(0, lastSeparator);
    const positionStr = key.substring(lastSeparator + 2);
    return { title, position: parseInt(positionStr, 10) };
};

// -------------------------------- //
//       CRUD OPERATIONS (YJS)      //
// -------------------------------- //

/**
 * Create or update a scene's persistent metadata in Yjs.
 */
export const upsertSceneData = (data: SceneData, projectCtx: ProjectContextType) => {
    const { ydoc } = projectCtx;
    if (!ydoc) {
        console.warn("[Scenes] Cannot upsert: Yjs document not available");
        return;
    }

    const scenesMap = getScenesMap(ydoc);
    const key = getSceneKey(data.title, data.position);

    const sceneItem: PersistentSceneItem = {
        id: data.id || uuidv4(),
        synopsis: data.synopsis,
        color: data.color,
    };

    scenesMap.set(key, sceneItem);
    console.log(`[Scenes] Upserted scene: ${key}`);
};

/**
 * Delete a scene's persistent metadata from Yjs.
 */
export const deleteScenePersistence = (title: string, position: number, projectCtx: ProjectContextType) => {
    const { ydoc } = projectCtx;
    if (!ydoc) {
        console.warn("[Scenes] Cannot delete: Yjs document not available");
        return;
    }

    const scenesMap = getScenesMap(ydoc);
    const key = getSceneKey(title, position);

    if (scenesMap.has(key)) {
        scenesMap.delete(key);
        console.log(`[Scenes] Deleted scene: ${key}`);
    }
};

/**
 * Get a scene's persistent data by title and position.
 */
export const getScenePersistence = (
    title: string,
    position: number,
    projectCtx: ProjectContextType
): PersistentSceneItem | undefined => {
    const { ydoc } = projectCtx;
    if (!ydoc) return undefined;

    const scenesMap = getScenesMap(ydoc);
    const key = getSceneKey(title, position);
    return scenesMap.get(key);
};

// -------------------------------- //
//       MERGE LOGIC                //
// -------------------------------- //

/**
 * Create default persistent data for a scene.
 */
export const createDefaultSceneItem = (): Omit<PersistentSceneItem, "id"> => ({
    synopsis: "",
});

/**
 * Merge computed scenes with persistent scene data from Yjs.
 */
export const mergeScenesData = (
    persistentScenes: Map<string, PersistentSceneItem>,
    computedScenes: ComputedScenesData
): MergedScenesData => {
    return computedScenes.map((computed) => {
        const key = getSceneKey(computed.title, computed.position);
        const persistent = persistentScenes.get(key);

        if (persistent) {
            return {
                ...computed,
                id: persistent.id,
                synopsis: persistent.synopsis,
                color: persistent.color,
                notes: persistent.notes,
                isPersistent: true,
            };
        }

        return {
            ...computed,
            id: null,
            synopsis: "",
            isPersistent: false,
        };
    });
};

// -------------------------------- //
//       PERSISTENCE UTILITIES      //
// -------------------------------- //

/**
 * Check if a scene is persistent (stored in Yjs).
 */
export const isScenePersistent = (title: string, position: number, projectCtx: ProjectContextType): boolean => {
    const { ydoc } = projectCtx;
    if (!ydoc) return false;

    const scenesMap = getScenesMap(ydoc);
    const key = getSceneKey(title, position);
    return scenesMap.has(key);
};

/**
 * Make a scene persistent by adding it to Yjs.
 */
export const makeScenePersistent = (
    title: string,
    position: number,
    projectCtx: ProjectContextType,
    data?: Partial<PersistentSceneItem>
) => {
    upsertSceneData(
        {
            title,
            position,
            id: data?.id || uuidv4(),
            synopsis: data?.synopsis || "",
            color: data?.color,
            notes: data?.notes,
        },
        projectCtx
    );
};
