"use client";

/**
 * scenes.ts
 *
 * Scene management with transient (computed) and persistent (Yjs) data.
 *
 * Architecture:
 * - SceneItem: Transient data computed from parsing the screenplay.
 *   These hold position info, title, preview, and optionally an id if the scene
 *   has been persisted (scene heading has a data-id attribute).
 *
 * - PersistentScene: User-editable metadata stored in Yjs.
 *   Only scenes that have been explicitly edited (synopsis, color) or created
 *   from the UI are persisted. Keyed by scene id (UUID).
 *
 * - Scene: Full scene data combining SceneItem with optional persistent data.
 *   This is what gets exposed to the UI.
 */

import { getNodeData } from "./screenplay";
import { ScreenplayElement } from "../utils/enums";
import { Screenplay } from "../utils/types";
import { JSONContent } from "@tiptap/react";
import type { SceneToken } from "./scene-locking";
import { compileSceneLabel } from "./scene-locking";

/**
 * Recursively compute the ProseMirror nodeSize of a JSONContent node.
 * For leaf nodes (text): text.length + 2 (opening + closing token).
 * For branch nodes: 2 + sum of children sizes.
 */
export const getJSONNodeSize = (node: JSONContent): number => {
    if (node.text !== undefined) return node.text?.length ?? 0;
    const childrenSize = (node.content ?? []).reduce((acc, child) => acc + getJSONNodeSize(child), 0);
    return 2 + childrenSize;
};

// -------------------------------- //
//          TYPE DEFINITIONS        //
// -------------------------------- //

/**
 * Computed scene data from screenplay parsing.
 * These are transient and recalculated on every screenplay change.
 * The id is optional - only present if the scene heading has a data-id attribute.
 */
export type TransientScene = {
    id?: string;
    title: string;
    preview: string;
    position: number;
    nextPosition: number;
};

/**
 * Persistent scene metadata stored in Yjs.
 * Keyed by scene id (UUID) in the Yjs map.
 *
 * Contains both user-editable fields (synopsis, color) and production-mode
 * fields (token, omitted). `token` is the structural, mode-independent
 * representation of the scene's frozen number under production lock; the
 * display label is derived from it via `compileSceneLabel`. `omitted`
 * flags the scene as an OMITTED placeholder.
 */
export type PersistentScene = {
    synopsis?: string;
    color?: string;
    /** Frozen structural position under production lock. */
    token?: SceneToken;
    /** True when the scene is an OMITTED placeholder (only meaningful with `token`). */
    omitted?: boolean;
    /** Original heading text saved when the scene was omitted, restored on unomit. */
    originalHeading?: string;
    /** The scene's body nodes (serialized ProseMirror JSON) captured when the
     *  scene was omitted. Omitting cuts the body out of the document and parks
     *  it here; unomitting re-inserts it right after the heading. Keeping it out
     *  of the document means an omitted scene paginates like a one-line heading
     *  with no special handling. */
    omittedBody?: JSONContent[];
    /** Page locks whose anchor nodes lived inside the cut body, saved so unomit
     *  can restore them. Only set when the omitted scene crossed a locked page
     *  break. */
    omittedPageLocks?: { anchorId: string; token: SceneToken; splitOffset?: number }[];
    /** When the omitted scene crossed a locked page break, the lock is re-homed
     *  onto the following scene heading (`reanchoredSuccessor`) so it stays
     *  pinned to its locked page instead of spilling upward. unomit removes that
     *  re-homed lock before restoring `omittedPageLocks`. */
    reanchoredSuccessor?: string;
};

/**
 * Map of persistent scenes keyed by scene id.
 */
export type PersistentSceneMap = { [id: string]: PersistentScene };

/**
 * Full scene data combining transient and persistent data.
 * This is what gets exposed to the UI.
 *
 * `token` is the structural lock (when persisted); `label` is the derived
 * display string (compiled from the token). Both are absent for scenes
 * that have not been locked. UI code that needs *provisional* labels
 * should call `computeSceneLabels()` over the full ordered scene list
 * instead of reading `Scene.label` directly.
 */
export type Scene = TransientScene & {
    synopsis?: string;
    color?: string;
    token?: SceneToken;
    label?: string;
    omitted?: boolean;
};

// -------------------------------- //
//       SCENE PARSING              //
// -------------------------------- //

/**
 * Extract a preview of the scene content (first ~30 characters after the heading).
 */
const getScenePreview = (nodes: JSONContent[], cursor: number): string => {
    let preview = "";

    for (let i = cursor; i < nodes.length && preview.length <= 30; i++) {
        const node = getNodeData(nodes[i]);
        if (node.type === ScreenplayElement.None) continue;
        if (node.type === ScreenplayElement.Scene) break; // stop when next scene is found

        preview += node.flattenText + " ";
    }

    return preview.trim();
};

/**
 * Parse the screenplay and compute scene items.
 * Scenes are identified by scene headings (ScreenplayElement.Scene).
 * If a scene heading has a data-id attribute, the id is extracted.
 */
export const computeSceneItems = (screenplay: Screenplay): TransientScene[] => {
    if (!screenplay) {
        return [];
    }

    const scenes: TransientScene[] = [];
    let cursor = 1;
    let sceneNumber = 0;

    for (let i = 0; i < screenplay.length; i++) {
        const node = getNodeData(screenplay[i]);

        if (node.type === ScreenplayElement.None) {
            cursor += 2; // empty screenplay element count for new line
            continue;
        }

        // Container node: use recursive size calculation to keep cursor accurate.
        if (screenplay[i].type === ScreenplayElement.DualDialogue) {
            cursor += getJSONNodeSize(screenplay[i]);
            continue;
        }

        if (node.type === ScreenplayElement.Scene) {
            if (sceneNumber !== 0) {
                // Set nextPosition for the previous scene
                scenes[scenes.length - 1].nextPosition = cursor;
            }

            // Extract scene id from data attribute if present
            const sceneId: string | undefined = screenplay[i].attrs?.["data-id"];

            scenes.push({
                id: sceneId,
                position: cursor,
                nextPosition: -1,
                title: node.flattenText.toUpperCase(),
                preview: getScenePreview(screenplay, i + 1),
            });

            sceneNumber++;
        }

        cursor += node.flattenText.length + 2; // new line counts for 2 characters
    }

    if (scenes.length > 0) {
        scenes[scenes.length - 1].nextPosition = cursor;
    }

    return scenes;
};

// -------------------------------- //
//       MERGE LOGIC                //
// -------------------------------- //

/**
 * Merge computed scene items with persistent scene data from Yjs.
 * Returns full Scene objects for UI consumption.
 */
export const mergeScenesData = (persistentScenes: PersistentSceneMap, screenplay: Screenplay): Scene[] => {
    const sceneItems = computeSceneItems(screenplay);

    return sceneItems.map((item) => {
        if (item.id && persistentScenes[item.id]) {
            const persistent = persistentScenes[item.id];
            return {
                ...item,
                synopsis: persistent.synopsis,
                color: persistent.color,
                token: persistent.token,
                label: persistent.token ? compileSceneLabel(persistent.token) : undefined,
                omitted: persistent.omitted,
            };
        }

        return { ...item };
    });
};

// -------------------------------- //
//       UTILITY FUNCTIONS          //
// -------------------------------- //

/**
 * Create default persistent scene data.
 */
export const createDefaultPersistentScene = (): PersistentScene => ({
    synopsis: "",
});
