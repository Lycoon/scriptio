"use client";

/**
 * locations.ts
 *
 * Extracts locations from scene headings and manages persistent locations via Yjs.
 * Locations are extracted from the text after the last hyphen in scene headings.
 */

import { ProjectContextType } from "@src/context/ProjectContext";
import { getNodeFlattenContent } from "./screenplay";
import { ScreenplayElement } from "../utils/enums";
import { Screenplay } from "../utils/types";

// -------------------------------- //
//          TYPE DEFINITIONS        //
// -------------------------------- //

export type LocationMap = { [name: string]: LocationItem };
export type LocationData = { name: string } & LocationItem;

export type LocationItem = {
    persistent: boolean;
    description: string;
    // Future extensible fields
    notes?: string;
    color?: string;
    imageUrl?: string;
};

// -------------------------------- //
//       CRUD OPERATIONS (YJS)      //
// -------------------------------- //

/**
 * Create or update a location in the Yjs document.
 * This will automatically sync to all connected collaborators.
 */
export const upsertLocationData = (data: LocationData, projectCtx: ProjectContextType) => {
    if (projectCtx.isReadOnly) return;
    const ydoc = projectCtx.repository?.getState();
    if (!ydoc) {
        console.warn("[Locations] Cannot upsert: Yjs document not available");
        return;
    }

    const locationsMap = ydoc.locations();
    const locationItem: LocationItem = {
        persistent: true,
        description: data.description,
        notes: data.notes,
        color: data.color,
        imageUrl: data.imageUrl,
    };

    locationsMap.set(data.name, locationItem);
    console.log(`[Locations] Upserted location: ${data.name}`);
};

/**
 * Delete a location from the Yjs document.
 */
export const deleteLocation = (name: string, projectCtx: ProjectContextType) => {
    if (projectCtx.isReadOnly) return;
    const ydoc = projectCtx.repository?.getState();
    if (!ydoc) {
        console.warn("[Locations] Cannot delete: Yjs document not available");
        return;
    }

    const locationsMap = ydoc.locations();
    if (locationsMap.has(name)) {
        locationsMap.delete(name);
        console.log(`[Locations] Deleted location: ${name}`);
    }
};

/**
 * Rename a location in the Yjs document.
 */
export const renameLocation = (oldName: string, newName: string, projectCtx: ProjectContextType) => {
    if (projectCtx.isReadOnly) return;
    const ydoc = projectCtx.repository?.getState();
    if (!ydoc) {
        console.warn("[Locations] Cannot rename: Yjs document not available");
        return;
    }

    const locationsMap = ydoc.locations();
    const location = locationsMap.get(oldName);

    if (location) {
        ydoc.transact(() => {
            locationsMap.delete(oldName);
            locationsMap.set(newName, location);
        });
        console.log(`[Locations] Renamed location: ${oldName} -> ${newName}`);
    }
};

/**
 * Check if a location exists (case-insensitive).
 */
export const doesLocationExist = (name: string, projectCtx: ProjectContextType): boolean => {
    if (!projectCtx.locations) return false;
    const nameUppered = name.toUpperCase();
    return Object.keys(projectCtx.locations).some((key) => key.toUpperCase() === nameUppered);
};

/**
 * Get a location by name (case-insensitive).
 */
export const getLocation = (name: string, projectCtx: ProjectContextType): LocationItem | undefined => {
    if (!projectCtx.locations) return undefined;
    const nameUppered = name.toUpperCase();
    const key = Object.keys(projectCtx.locations).find((k) => k.toUpperCase() === nameUppered);
    return key ? projectCtx.locations[key] : undefined;
};

// -------------------------------- //
//       SCREENPLAY PARSING         //
// -------------------------------- //

/**
 * Interior / exterior prefix of a scene heading, longest form first so the
 * combined spellings win over the bare "INT"/"EXT" they start with. Exported
 * because the location starts where this prefix ends.
 */
export const SCENE_TYPE_PATTERN = /^\s*(I\/E|E\/I|INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|INT|EXT)\b\.?/i;

/**
 * Extract location from a scene heading.
 * Takes everything between the INT./EXT. prefix and the last hyphen.
 * Example: "INT. KITCHEN - DAY" -> "KITCHEN"
 * Example: "EXT. JOHN'S HOUSE - BACKYARD - NIGHT" -> "JOHN'S HOUSE - BACKYARD"
 * Example: "INT./EXT. CAR - NIGHT" -> "CAR"
 */
export const extractLocationFromSceneHeading = (sceneHeading: string): string | null => {
    const lastHyphenIndex = sceneHeading.lastIndexOf("-");
    if (lastHyphenIndex === -1) return null;

    // Skip the whole prefix rather than stopping at the first dot: a combined
    // "INT./EXT." slugline would otherwise leave its "/EXT." in the location.
    // Headings with no prefix at all keep the original first-dot behaviour.
    const prefix = sceneHeading.match(SCENE_TYPE_PATTERN);
    const start = prefix ? prefix[0].length : sceneHeading.indexOf(".") + 1;

    if (start === 0 || start >= lastHyphenIndex) return null;

    const location = sceneHeading.substring(start, lastHyphenIndex).trim();
    return location.length > 0 ? location.toUpperCase() : null;
};

/**
 * Extract all unique locations from the screenplay.
 */
export const getLocationNames = (screenplay: Screenplay): string[] => {
    if (!screenplay) return [];

    const locations: string[] = [];
    for (let i = 0; i < screenplay.length; i++) {
        const currNode = screenplay[i];
        const type: string = currNode.attrs?.["class"];

        if (type !== ScreenplayElement.Scene || !currNode.content) continue;

        const content = currNode.content;
        const flattenText: string = getNodeFlattenContent(content);
        const location = extractLocationFromSceneHeading(flattenText);

        if (location && !locations.includes(location)) {
            locations.push(location);
        }
    }

    return locations;
};

/**
 * Count how many times a location appears in scene headings.
 */
export const countLocationAppearances = (screenplay: Screenplay, locationName: string): number => {
    if (!screenplay) return 0;

    const upperName = locationName.toUpperCase();
    let count = 0;

    for (const node of screenplay) {
        const type: string = node.attrs?.["class"];

        if (type === ScreenplayElement.Scene && node.content) {
            const flattenText = getNodeFlattenContent(node.content);
            const location = extractLocationFromSceneHeading(flattenText);

            if (location === upperName) {
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
 * Create a default LocationItem for auto-detected locations.
 * These are non-persistent and have default values.
 */
export const createDefaultLocationItem = (): LocationItem => ({
    persistent: false,
    description: "",
});

/**
 * Extract locations from screenplay and merge with persistent locations from Yjs.
 * - Persistent locations (from Yjs) take precedence
 * - Auto-detected locations (from screenplay) fill in the rest with default values
 */
export const mergeLocationsData = (persistentLocations: LocationMap, screenplay: Screenplay): LocationMap => {
    const result: LocationMap = { ...persistentLocations };
    const namesFromScreenplay = getLocationNames(screenplay);

    for (const name of namesFromScreenplay) {
        // Check if location already exists (case-insensitive)
        const existingKey = Object.keys(result).find((k) => k.toUpperCase() === name.toUpperCase());

        // Only add if not already present
        if (!existingKey) {
            result[name] = createDefaultLocationItem();
        }
    }

    return result;
};

// -------------------------------- //
//       PERSISTENCE UTILITIES      //
// -------------------------------- //

/**
 * Check if a location is persistent (stored in Yjs).
 */
export const isLocationPersistent = (name: string, projectCtx: ProjectContextType): boolean => {
    const ydoc = projectCtx.repository?.getState();
    if (!ydoc) return false;

    const locationsMap = ydoc.locations();
    const upperName = name.toUpperCase();

    let found = false;
    locationsMap.forEach((_, key) => {
        if (key.toUpperCase() === upperName) {
            found = true;
        }
    });

    return found;
};

/**
 * Make a location persistent by adding it to Yjs.
 * If the location already exists in Yjs, updates it to be persistent.
 * If not, creates a new persistent location entry.
 */
export const makeLocationPersistent = (name: string, projectCtx: ProjectContextType, data?: Partial<LocationItem>) => {
    if (projectCtx.isReadOnly) return;
    const ydoc = projectCtx.repository?.getState();
    if (!ydoc) return;

    const locationsMap = ydoc.locations();

    // Get existing data from merged locations (could be auto-detected)
    const existingData = projectCtx.locations?.[name] || createDefaultLocationItem();

    const locationItem: LocationItem = {
        ...existingData,
        ...data,
        persistent: true,
    };

    locationsMap.set(name, locationItem);
    console.log(`[Locations] Made location persistent: ${name}`);
};
