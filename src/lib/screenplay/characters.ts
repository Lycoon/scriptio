"use client";

/**
 * characters.ts (Updated)
 *
 * Modified to use Yjs Y.Map for character storage instead of database JSON.
 * Characters are now synced in real-time with other collaborators.
 */

import { ProjectContextType } from "@src/context/ProjectContext";
import { getNodeFlattenContent } from "./screenplay";
import { ScreenplayElement } from "../utils/enums";
import { Screenplay } from "../utils/types";
import { getCharactersMap } from "@src/lib/project/project-yjs";

// -------------------------------- //
//          TYPE DEFINITIONS        //
// -------------------------------- //

export enum CharacterGender {
    FEMALE,
    MALE,
    OTHER,
}

export type CharacterMap = { [name: string]: CharacterItem };
export type CharacterData = { name: string } & CharacterItem;

export type CharacterItem = {
    persistent: boolean;
    gender: CharacterGender;
    synopsis: string;
    // Future extensible fields
    aliases?: string[];
    notes?: string;
    color?: string;
    imageUrl?: string;
};

// -------------------------------- //
//       CRUD OPERATIONS (YJS)      //
// -------------------------------- //

/**
 * Create or update a character in the Yjs document.
 * This will automatically sync to all connected collaborators.
 */
export const upsertCharacterData = (data: CharacterData, projectCtx: ProjectContextType) => {
    const { ydoc } = projectCtx;
    if (!ydoc) {
        console.warn("[Characters] Cannot upsert: Yjs document not available");
        return;
    }

    const charactersMap = getCharactersMap(ydoc);
    const characterItem: CharacterItem = {
        persistent: true, // Explicitly created/edited characters are always persistent
        gender: data.gender,
        synopsis: data.synopsis,
        aliases: data.aliases,
        notes: data.notes,
        color: data.color,
        imageUrl: data.imageUrl,
    };

    charactersMap.set(data.name, characterItem);
    console.log(`[Characters] Upserted character: ${data.name}`);
};

/**
 * Delete a character from the Yjs document.
 */
export const deleteCharacter = (name: string, projectCtx: ProjectContextType) => {
    const { ydoc } = projectCtx;
    if (!ydoc) {
        console.warn("[Characters] Cannot delete: Yjs document not available");
        return;
    }

    const charactersMap = getCharactersMap(ydoc);
    if (charactersMap.has(name)) {
        charactersMap.delete(name);
        console.log(`[Characters] Deleted character: ${name}`);
    }
};

/**
 * Rename a character in the Yjs document.
 */
export const renameCharacter = (oldName: string, newName: string, projectCtx: ProjectContextType) => {
    const { ydoc } = projectCtx;
    if (!ydoc) {
        console.warn("[Characters] Cannot rename: Yjs document not available");
        return;
    }

    const charactersMap = getCharactersMap(ydoc);
    const character = charactersMap.get(oldName);

    if (character) {
        ydoc.transact(() => {
            charactersMap.delete(oldName);
            charactersMap.set(newName, character);
        });
        console.log(`[Characters] Renamed character: ${oldName} -> ${newName}`);
    }
};

/**
 * Check if a character exists (case-insensitive).
 */
export const doesCharacterExist = (name: string, projectCtx: ProjectContextType): boolean => {
    const nameUppered = name.toUpperCase();
    return Object.keys(projectCtx.charactersData).some((key) => key.toUpperCase() === nameUppered);
};

/**
 * Get a character by name (case-insensitive).
 */
export const getCharacter = (name: string, projectCtx: ProjectContextType): CharacterItem | undefined => {
    const nameUppered = name.toUpperCase();
    const key = Object.keys(projectCtx.charactersData).find((k) => k.toUpperCase() === nameUppered);
    return key ? projectCtx.charactersData[key] : undefined;
};

// -------------------------------- //
//       SCREENPLAY PARSING         //
// -------------------------------- //

/**
 * Extract all character names from the screenplay.
 */
export const getCharacterNames = (screenplay: Screenplay): string[] => {
    if (!screenplay.content) return [];

    const nodes = screenplay.content;
    const characters: string[] = [];

    for (let i = 0; i < nodes.length; i++) {
        const currNode = nodes[i];
        const type: string = currNode.attrs?.["class"];

        if (type !== ScreenplayElement.Character || !currNode.content) continue;

        const content = currNode.content;
        const flattenText: string = getNodeFlattenContent(content);
        const upperName = flattenText.toUpperCase().trim();

        // Remove parenthetical extensions like "(V.O.)" or "(O.S.)"
        const cleanName = upperName.replace(/\s*\(.*?\)\s*$/, "").trim();

        if (cleanName && !characters.includes(cleanName)) {
            characters.push(cleanName);
        }
    }

    return characters;
};

/**
 * Count how many times a character appears in the screenplay.
 */
export const countCharacterAppearances = (screenplay: Screenplay, characterName: string): number => {
    if (!screenplay.content) return 0;

    const upperName = characterName.toUpperCase();
    let count = 0;

    for (const node of screenplay.content) {
        const type: string = node.attrs?.["class"];

        if (type === ScreenplayElement.Character && node.content) {
            const flattenText = getNodeFlattenContent(node.content).toUpperCase().trim();
            const cleanName = flattenText.replace(/\s*\(.*?\)\s*$/, "").trim();

            if (cleanName === upperName) {
                count++;
            }
        }
    }

    return count;
};

// -------------------------------- //
//       AUTO-DETECTION             //
// -------------------------------- //

/**
 * Create a default CharacterItem for auto-detected characters.
 * These are non-persistent and have default values.
 */
export const createDefaultCharacterItem = (): CharacterItem => ({
    persistent: false,
    gender: CharacterGender.OTHER,
    synopsis: "",
});

/**
 * Extract characters from screenplay and merge with persistent characters from Yjs.
 * - Persistent characters (from Yjs) take precedence
 * - Auto-detected characters (from screenplay) fill in the rest with default values
 */
export const mergeCharactersData = (
    persistentCharacters: CharacterMap,
    screenplay: Screenplay
): CharacterMap => {
    const result: CharacterMap = { ...persistentCharacters };
    const namesFromScreenplay = getCharacterNames(screenplay);

    for (const name of namesFromScreenplay) {
        // Check if character already exists (case-insensitive)
        const existingKey = Object.keys(result).find(
            (k) => k.toUpperCase() === name.toUpperCase()
        );

        // Only add if not already present
        if (!existingKey) {
            result[name] = createDefaultCharacterItem();
        }
    }

    return result;
};

// -------------------------------- //
//       PERSISTENCE UTILITIES      //
// -------------------------------- //

/**
 * Check if a character is persistent (stored in Yjs).
 */
export const isCharacterPersistent = (name: string, projectCtx: ProjectContextType): boolean => {
    const { ydoc } = projectCtx;
    if (!ydoc) return false;

    const charactersMap = getCharactersMap(ydoc);
    const upperName = name.toUpperCase();

    let found = false;
    charactersMap.forEach((_, key) => {
        if (key.toUpperCase() === upperName) {
            found = true;
        }
    });

    return found;
};

/**
 * Make a character persistent by adding it to Yjs.
 * If the character already exists in Yjs, updates it to be persistent.
 * If not, creates a new persistent character entry.
 */
export const makeCharacterPersistent = (
    name: string,
    projectCtx: ProjectContextType,
    data?: Partial<CharacterItem>
) => {
    const { ydoc, charactersData } = projectCtx;
    if (!ydoc) return;

    const charactersMap = getCharactersMap(ydoc);

    // Get existing data from merged charactersData (could be auto-detected)
    const existingData = charactersData[name] || createDefaultCharacterItem();

    const characterItem: CharacterItem = {
        ...existingData,
        ...data,
        persistent: true,
    };

    charactersMap.set(name, characterItem);
    console.log(`[Characters] Made character persistent: ${name}`);
};
