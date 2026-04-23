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
import { getCharactersMap } from "@src/lib/project/project-state";

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
    const ydoc = projectCtx.repository?.getState();
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
    const ydoc = projectCtx.repository?.getState();
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
 * Rename a character in the Yjs document (case-insensitive lookup).
 * If the character exists in the persistent map, it will be renamed.
 * If not, this is a no-op (the character will be created by upsertCharacterData).
 */
export const renameCharacter = (oldName: string, newName: string, projectCtx: ProjectContextType) => {
    const ydoc = projectCtx.repository?.getState();
    if (!ydoc) {
        console.warn("[Characters] Cannot rename: Yjs document not available");
        return;
    }

    const charactersMap = getCharactersMap(ydoc);

    // Find the character with case-insensitive matching
    const oldNameUpper = oldName.toUpperCase();
    let existingKey: string | undefined;
    let character: CharacterItem | undefined;

    charactersMap.forEach((value, key) => {
        if (key.toUpperCase() === oldNameUpper) {
            existingKey = key;
            character = value;
        }
    });

    if (existingKey && character) {
        const characterToRename = character;
        ydoc.transact(() => {
            charactersMap.delete(existingKey!);
            charactersMap.set(newName.toUpperCase(), characterToRename);
        });
        console.log(`[Characters] Renamed character: ${existingKey} -> ${newName.toUpperCase()}`);
    }
};

/**
 * Check if a character exists (case-insensitive).
 */
export const doesCharacterExist = (name: string, projectCtx: ProjectContextType): boolean => {
    if (!projectCtx.characters) return false;
    const nameUppered = name.toUpperCase();
    return Object.keys(projectCtx.characters).some((key) => key.toUpperCase() === nameUppered);
};

/**
 * Get a character by name (case-insensitive).
 */
export const getCharacter = (name: string, projectCtx: ProjectContextType): CharacterItem | undefined => {
    if (!projectCtx.characters) return undefined;
    const nameUppered = name.toUpperCase();
    const key = Object.keys(projectCtx.characters).find((k) => k.toUpperCase() === nameUppered);
    return key ? projectCtx.characters[key] : undefined;
};

// -------------------------------- //
//       SCREENPLAY PARSING         //
// -------------------------------- //

/**
 * Extract all character names from the screenplay.
 */
export const getCharacterNames = (screenplay: Screenplay): string[] => {
    if (!screenplay) return [];

    const characters: string[] = [];

    for (let i = 0; i < screenplay.length; i++) {
        const currNode = screenplay[i];
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
    if (!screenplay) return 0;

    const upperName = characterName.toUpperCase();
    let count = 0;

    for (const node of screenplay) {
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
export const mergeCharactersData = (persistentCharacters: CharacterMap, screenplay: Screenplay): CharacterMap => {
    const result: CharacterMap = { ...persistentCharacters };
    const namesFromScreenplay = getCharacterNames(screenplay);

    for (const name of namesFromScreenplay) {
        // Check if character already exists (case-insensitive)
        const existingKey = Object.keys(result).find((k) => k.toUpperCase() === name.toUpperCase());

        // Only add if not already present
        if (!existingKey) {
            result[name] = createDefaultCharacterItem();
        }
    }

    return result;
};
