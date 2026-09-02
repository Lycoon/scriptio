import { describe, expect, it } from "vitest";
import { JSONContent } from "@tiptap/react";

import { ScreenplayElement } from "@src/lib/utils/enums";
import { DUAL_DIALOGUE_COLUMN } from "@src/lib/screenplay/nodes";
import { extractLocationFromSceneHeading } from "@src/lib/screenplay/locations";
import { computeSceneItems } from "@src/lib/screenplay/scenes";
import {
    collectFacetOptions,
    computeSceneFacets,
    extractSceneTypeFromSceneHeading,
    extractTimeOfDayFromSceneHeading,
    sceneMatchesFilter,
    toggleFilterValue,
    EMPTY_SCENE_FILTER,
} from "@src/lib/screenplay/scene-filters";

const node = (type: string, text: string): JSONContent => ({
    type,
    content: [{ type: "text", text }],
});

const scene = (heading: string) => node(ScreenplayElement.Scene, heading);
const character = (name: string) => node(ScreenplayElement.Character, name);
const action = (text: string) => node(ScreenplayElement.Action, text);
const dialogue = (text: string) => node(ScreenplayElement.Dialogue, text);

const dualDialogue = (left: string, right: string): JSONContent => ({
    type: ScreenplayElement.DualDialogue,
    content: [
        { type: DUAL_DIALOGUE_COLUMN, content: [character(left), dialogue("Left line.")] },
        { type: DUAL_DIALOGUE_COLUMN, content: [character(right), dialogue("Right line.")] },
    ],
});

const screenplay: JSONContent[] = [
    scene("INT. KITCHEN - DAY"),
    action("Steam on the windows."),
    character("ANNA"),
    dialogue("Coffee?"),
    character("BEN (V.O.)"),
    dialogue("Always."),
    scene("EXT. JOHN'S HOUSE - BACKYARD - NIGHT"),
    character("ANNA"),
    dialogue("It's late."),
    scene("INT. KITCHEN - NIGHT"),
    dualDialogue("CARL", "ANNA"),
];

describe("scene facets", () => {
    it("reports the type, location, time of day and cues of every scene", () => {
        const facets = computeSceneFacets(screenplay);

        expect(facets.map((f) => f.sceneType)).toEqual(["INT", "EXT", "INT"]);
        expect(facets.map((f) => f.location)).toEqual(["KITCHEN", "JOHN'S HOUSE - BACKYARD", "KITCHEN"]);
        expect(facets.map((f) => f.timeOfDay)).toEqual(["DAY", "NIGHT", "NIGHT"]);
        // Cue extensions are stripped, and dual-dialogue cues are found one
        // level down inside the container node.
        expect(facets.map((f) => f.characters)).toEqual([["ANNA", "BEN"], ["ANNA"], ["CARL", "ANNA"]]);
    });

    it("reports positions that line up with the parsed scenes", () => {
        const facets = computeSceneFacets(screenplay);
        const scenes = computeSceneItems(screenplay);

        expect(facets.map((f) => f.position)).toEqual(scenes.map((s) => s.position));
    });

    it("reads the time of day as the text after the last hyphen", () => {
        expect(extractTimeOfDayFromSceneHeading("INT. KITCHEN - DAY")).toBe("DAY");
        expect(extractTimeOfDayFromSceneHeading("EXT. HOUSE - BACKYARD - CONTINUOUS")).toBe("CONTINUOUS");
        expect(extractTimeOfDayFromSceneHeading("INT. KITCHEN")).toBeNull();
    });

    it("normalises the interior / exterior prefix", () => {
        expect(extractSceneTypeFromSceneHeading("INT. KITCHEN - DAY")).toBe("INT");
        expect(extractSceneTypeFromSceneHeading("EXT. STREET - DAY")).toBe("EXT");
        expect(extractSceneTypeFromSceneHeading("INT./EXT. CAR - NIGHT")).toBe("INT/EXT");
        expect(extractSceneTypeFromSceneHeading("EXT./INT. CAR - NIGHT")).toBe("INT/EXT");
        expect(extractSceneTypeFromSceneHeading("I/E. CAR - NIGHT")).toBe("INT/EXT");
        // Not a slugline prefix: "INTERIOR" must not be read as "INT".
        expect(extractSceneTypeFromSceneHeading("INTERIOR DECORATOR'S OFFICE - DAY")).toBeNull();
        expect(extractSceneTypeFromSceneHeading("THE NEXT MORNING")).toBeNull();
    });

    it("keeps the prefix out of the location, combined sluglines included", () => {
        expect(extractLocationFromSceneHeading("INT. KITCHEN - DAY")).toBe("KITCHEN");
        expect(extractLocationFromSceneHeading("EXT. HOUSE - BACKYARD - NIGHT")).toBe("HOUSE - BACKYARD");
        // The second half of a combined prefix used to be read as the location.
        expect(extractLocationFromSceneHeading("INT./EXT. CAR - NIGHT")).toBe("CAR");
        expect(extractLocationFromSceneHeading("EXT./INT. CAR - NIGHT")).toBe("CAR");
        expect(extractLocationFromSceneHeading("I/E. CAR - NIGHT")).toBe("CAR");
        // No prefix: unchanged: everything between the first dot and the last hyphen.
        expect(extractLocationFromSceneHeading("FLASHBACK. THE PIER - DAWN")).toBe("THE PIER");
        expect(extractLocationFromSceneHeading("THE NEXT MORNING")).toBeNull();
    });

    it("counts each facet value across the scenes", () => {
        const options = collectFacetOptions(computeSceneFacets(screenplay));

        expect(options.characters).toEqual([
            { value: "ANNA", count: 3 },
            { value: "BEN", count: 1 },
            { value: "CARL", count: 1 },
        ]);
        expect(options.locations).toEqual([
            { value: "JOHN'S HOUSE - BACKYARD", count: 1 },
            { value: "KITCHEN", count: 2 },
        ]);
        expect(options.timesOfDay).toEqual([
            { value: "DAY", count: 1 },
            { value: "NIGHT", count: 2 },
        ]);
        expect(options.sceneTypes).toEqual([
            { value: "EXT", count: 1 },
            { value: "INT", count: 2 },
        ]);
    });
});

describe("scene filtering", () => {
    const facets = computeSceneFacets(screenplay);
    const matches = (filter: Parameters<typeof sceneMatchesFilter>[1]) =>
        facets.filter((f) => sceneMatchesFilter(f, filter)).map((f) => facets.indexOf(f));

    it("keeps every scene while no filter is set", () => {
        expect(matches(EMPTY_SCENE_FILTER)).toEqual([0, 1, 2]);
    });

    it("requires every selected character to be in the scene", () => {
        expect(matches({ ...EMPTY_SCENE_FILTER, characters: ["ANNA"] })).toEqual([0, 1, 2]);
        expect(matches({ ...EMPTY_SCENE_FILTER, characters: ["ANNA", "BEN"] })).toEqual([0]);
        expect(matches({ ...EMPTY_SCENE_FILTER, characters: ["BEN", "CARL"] })).toEqual([]);
    });

    it("accepts any of the selected locations, times of day and scene types", () => {
        expect(matches({ ...EMPTY_SCENE_FILTER, locations: ["KITCHEN"] })).toEqual([0, 2]);
        expect(matches({ ...EMPTY_SCENE_FILTER, timesOfDay: ["DAY", "NIGHT"] })).toEqual([0, 1, 2]);
        expect(matches({ ...EMPTY_SCENE_FILTER, sceneTypes: ["EXT"] })).toEqual([1]);
        expect(matches({ ...EMPTY_SCENE_FILTER, sceneTypes: ["INT", "EXT"] })).toEqual([0, 1, 2]);
    });

    it("combines every dimension cumulatively", () => {
        expect(
            matches({
                characters: ["ANNA", "CARL"],
                locations: ["KITCHEN"],
                timesOfDay: ["NIGHT"],
                sceneTypes: ["INT"],
            }),
        ).toEqual([2]);
        // Same scene, wrong time of day.
        expect(
            matches({
                characters: ["ANNA", "CARL"],
                locations: ["KITCHEN"],
                timesOfDay: ["DAY"],
                sceneTypes: ["INT"],
            }),
        ).toEqual([]);
        // Same scene, wrong scene type.
        expect(
            matches({
                characters: ["ANNA", "CARL"],
                locations: ["KITCHEN"],
                timesOfDay: ["NIGHT"],
                sceneTypes: ["EXT"],
            }),
        ).toEqual([]);
    });

    it("excludes a scene with no facets at all once a filter is on", () => {
        expect(sceneMatchesFilter(undefined, { ...EMPTY_SCENE_FILTER, locations: ["KITCHEN"] })).toBe(false);
        expect(sceneMatchesFilter(undefined, EMPTY_SCENE_FILTER)).toBe(true);
    });

    it("toggles a value in one dimension without touching the others", () => {
        const withAnna = toggleFilterValue(EMPTY_SCENE_FILTER, "characters", "ANNA");
        expect(withAnna).toEqual({ characters: ["ANNA"], locations: [], timesOfDay: [], sceneTypes: [] });

        const withBoth = toggleFilterValue(withAnna, "characters", "BEN");
        expect(withBoth.characters).toEqual(["ANNA", "BEN"]);

        expect(toggleFilterValue(withBoth, "characters", "ANNA").characters).toEqual(["BEN"]);
    });
});
