"use client";

/**
 * scene-filters.ts
 *
 * Per-scene facets (characters, location, time of day) used by the navigation
 * sidebar's scene filter.
 *
 * Facets are computed from the parsed screenplay, never persisted: the location
 * and the time of day come from the scene heading, the characters from the
 * character cues inside the scene body. Each facet carries the scene heading's
 * document `position`, which is what `Scene.position` holds — keying by it (not
 * by index) keeps the association correct while an optimistic drag reorder is
 * still waiting for the screenplay to be re-parsed.
 */

import { JSONContent } from "@tiptap/react";
import { getNodeData } from "./screenplay";
import { ScreenplayElement } from "../utils/enums";
import { Screenplay } from "../utils/types";
import { SCENE_TYPE_PATTERN, extractLocationFromSceneHeading } from "./locations";
import { getJSONNodeSize } from "./scenes";

// -------------------------------- //
//          TYPE DEFINITIONS        //
// -------------------------------- //

export type SceneFacets = {
    /** Document position of the scene heading — matches `Scene.position`. */
    position: number;
    /** Interior / exterior, normalised to "INT", "EXT" or "INT/EXT". */
    sceneType: string | null;
    location: string | null;
    timeOfDay: string | null;
    /** Unique, upper-cased character cues appearing in the scene. */
    characters: string[];
};

/** The cumulative filter dimensions. Empty list = dimension unfiltered. */
export type SceneFilter = {
    characters: string[];
    locations: string[];
    timesOfDay: string[];
    sceneTypes: string[];
};

/** A selectable value in the filter panel, with how many scenes carry it. */
export type FacetOption = {
    value: string;
    count: number;
};

export const EMPTY_SCENE_FILTER: SceneFilter = {
    characters: [],
    locations: [],
    timesOfDay: [],
    sceneTypes: [],
};

/** Every dimension of a filter, in the order the panel lists them. */
const FILTER_DIMENSIONS: (keyof SceneFilter)[] = ["characters", "locations", "timesOfDay", "sceneTypes"];

export const countSceneFilters = (filter: SceneFilter): number =>
    FILTER_DIMENSIONS.reduce((total, dimension) => total + filter[dimension].length, 0);

export const isSceneFilterActive = (filter: SceneFilter): boolean => countSceneFilters(filter) > 0;

// -------------------------------- //
//          SCENE PARSING           //
// -------------------------------- //

/**
 * Extract the time of day from a scene heading: everything after the last
 * hyphen, which is where `extractLocationFromSceneHeading` stops.
 * Example: "INT. KITCHEN - DAY" -> "DAY"
 * Example: "EXT. JOHN'S HOUSE - BACKYARD - NIGHT" -> "NIGHT"
 */
export const extractTimeOfDayFromSceneHeading = (sceneHeading: string): string | null => {
    const lastHyphenIndex = sceneHeading.lastIndexOf("-");
    if (lastHyphenIndex === -1) return null;

    const timeOfDay = sceneHeading.substring(lastHyphenIndex + 1).trim();
    return timeOfDay.length > 0 ? timeOfDay.toUpperCase() : null;
};

/**
 * Extract the scene type from a scene heading, normalised so the panel offers
 * one option per type rather than one per spelling. Shares its pattern with the
 * location extractor, which starts where this prefix ends.
 * Example: "INT. KITCHEN - DAY" -> "INT"
 * Example: "EXT./INT. CAR - NIGHT" -> "INT/EXT"
 */
export const extractSceneTypeFromSceneHeading = (sceneHeading: string): string | null => {
    const match = sceneHeading.match(SCENE_TYPE_PATTERN);
    if (!match) return null;

    const type = match[1].replace(/[.\s]/g, "").toUpperCase();
    if (type === "INT" || type === "EXT") return type;
    return "INT/EXT";
};

/** Normalise a character cue the same way `getCharacterNames` does, so the
 *  facets match the names shown by the characters panel: upper-cased and
 *  stripped of extensions like "(V.O.)". */
const cleanCharacterName = (rawName: string): string =>
    rawName
        .toUpperCase()
        .trim()
        .replace(/\s*\(.*?\)\s*$/, "")
        .trim();

const addCharacter = (facets: SceneFacets, rawName: string) => {
    const name = cleanCharacterName(rawName);
    if (name && !facets.characters.includes(name)) facets.characters.push(name);
};

/** Collect character cues nested inside a container node (dual dialogue). */
const collectNestedCharacters = (node: JSONContent, facets: SceneFacets) => {
    if (node.type === ScreenplayElement.Character) {
        addCharacter(facets, getNodeData(node).flattenText);
        return;
    }

    for (const child of node.content ?? []) collectNestedCharacters(child, facets);
};

/**
 * Compute the filter facets of every scene, in document order.
 *
 * Mirrors `computeSceneItems`' cursor arithmetic so the reported positions line
 * up with the scenes the sidebar renders.
 */
export const computeSceneFacets = (screenplay: Screenplay): SceneFacets[] => {
    if (!screenplay) return [];

    const facets: SceneFacets[] = [];
    let current: SceneFacets | null = null;
    let cursor = 1;

    for (let i = 0; i < screenplay.length; i++) {
        const node = getNodeData(screenplay[i]);

        if (node.type === ScreenplayElement.None) {
            cursor += 2; // empty screenplay element count for new line
            continue;
        }

        // Container node: its cues live one level down, and its size has to be
        // measured recursively to keep the cursor accurate.
        if (screenplay[i].type === ScreenplayElement.DualDialogue) {
            if (current) collectNestedCharacters(screenplay[i], current);
            cursor += getJSONNodeSize(screenplay[i]);
            continue;
        }

        if (node.type === ScreenplayElement.Scene) {
            const heading = node.flattenText.toUpperCase();
            current = {
                position: cursor,
                sceneType: extractSceneTypeFromSceneHeading(heading),
                location: extractLocationFromSceneHeading(heading),
                timeOfDay: extractTimeOfDayFromSceneHeading(heading),
                characters: [],
            };
            facets.push(current);
        } else if (current && node.type === ScreenplayElement.Character) {
            addCharacter(current, node.flattenText);
        }

        cursor += node.flattenText.length + 2; // new line counts for 2 characters
    }

    return facets;
};

// -------------------------------- //
//          FILTERING               //
// -------------------------------- //

/** A single-valued dimension passes when the scene's value is one of the
 *  selected ones; an unset selection lets every scene through. */
const matchesSingleValue = (selected: string[], value: string | null): boolean =>
    selected.length === 0 || (!!value && selected.includes(value));

/**
 * Whether a scene passes the filter. Dimensions are cumulative (AND), and so
 * are the values within the character dimension: picking two characters keeps
 * only the scenes where both of them speak. The other dimensions hold one value
 * per scene, so their selections read as "any of" instead.
 */
export const sceneMatchesFilter = (facets: SceneFacets | undefined, filter: SceneFilter): boolean => {
    if (!isSceneFilterActive(filter)) return true;
    if (!facets) return false;

    if (!filter.characters.every((name) => facets.characters.includes(name))) return false;
    if (!matchesSingleValue(filter.locations, facets.location)) return false;
    if (!matchesSingleValue(filter.timesOfDay, facets.timeOfDay)) return false;
    if (!matchesSingleValue(filter.sceneTypes, facets.sceneType)) return false;

    return true;
};

/** Toggle a value in one filter dimension, returning a new filter. */
export const toggleFilterValue = (
    filter: SceneFilter,
    dimension: keyof SceneFilter,
    value: string,
): SceneFilter => {
    const values = filter[dimension];
    return {
        ...filter,
        [dimension]: values.includes(value) ? values.filter((v) => v !== value) : [...values, value],
    };
};

/** Build the panel's option lists from the facets, sorted alphabetically. */
export const collectFacetOptions = (facets: SceneFacets[]): Record<keyof SceneFilter, FacetOption[]> => {
    const characters = new Map<string, number>();
    const locations = new Map<string, number>();
    const timesOfDay = new Map<string, number>();
    const sceneTypes = new Map<string, number>();

    const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

    for (const scene of facets) {
        for (const name of scene.characters) bump(characters, name);
        if (scene.location) bump(locations, scene.location);
        if (scene.timeOfDay) bump(timesOfDay, scene.timeOfDay);
        if (scene.sceneType) bump(sceneTypes, scene.sceneType);
    }

    const toOptions = (map: Map<string, number>): FacetOption[] =>
        [...map.entries()]
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => a.value.localeCompare(b.value));

    return {
        characters: toOptions(characters),
        locations: toOptions(locations),
        timesOfDay: toOptions(timesOfDay),
        sceneTypes: toOptions(sceneTypes),
    };
};
