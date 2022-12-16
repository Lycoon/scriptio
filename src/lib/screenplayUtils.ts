import { Editor } from "@tiptap/react";
import { getCharacterNames } from "./statistics";

/* Nodes */
export type NodeData = {
    type: ScreenplayElement;
    content: any[]; // contains marks (bold, italic, etc.)
    flattenText: string; // contains only text
};

export enum ScreenplayElement {
    Scene,
    Action,
    Character,
    Dialogue,
    Parenthetical,
    Transition,
    Section,
    Note,
    None,
}

/* Scenes */
let scenesData: ScenesData = [];
export type ScenesData = SceneItem[];
export type SceneItem = {
    title: string;
    preview: string;
    position: number;
    nextPosition: number;
};
export const getScenesData = (): ScenesData => {
    return scenesData;
};

/* Characters */
let charactersData: CharacterMap = {};
export enum CharacterGender {
    Female,
    Male,
    Other,
}
export type CharacterMap = { [name: string]: CharacterItem }; // map by character name
export type CharacterData = { name: string } & CharacterItem;
export type CharacterItem = {
    gender: CharacterGender;
    synopsis: string;
};
export const getCharactersData = (): CharacterMap => {
    return charactersData;
};

export const doesCharacterExist = (name: string): boolean => {
    const nameUppered = name.toUpperCase();
    let found = false;

    Object.keys(charactersData).forEach((key) => {
        if (key.toUpperCase() === nameUppered) {
            found = true;
            return;
        }
    });

    return found;
};

const triggerUpdate = () => {
    const event = new Event("charactersDataUpdated");
    window.dispatchEvent(event);
};

export const upsertCharacterData = (name: string, data: CharacterItem) => {
    charactersData[name] = data;

    triggerUpdate();
};

export const deleteCharacter = (name: string) => {
    delete charactersData[name];

    triggerUpdate();
};

export const countOccurrences = (json: any, word: string): number => {
    const regex = new RegExp(`${word}`, "gi");
    const nodes = json.content!;
    let count = 0;

    for (let i = 0; i < nodes.length; i++) {
        const currNode = nodes[i];
        const content: any[] = currNode["content"];
        if (!content) continue;

        const text: string = content[0]["text"];
        const res = Array.from(text.matchAll(regex));
        count += res.length;
    }

    return count;
};

export const computeFullCharactersData = async (json: any, fetchedCharacters: CharacterMap) => {
    charactersData = fetchedCharacters ?? {};
    const namesFromEditor = getCharacterNames(json);

    for (const name of namesFromEditor) {
        if (charactersData[name] !== undefined) {
            // If character already exists in the data, don't overwrite it
            continue;
        }
        charactersData[name] = {
            gender: CharacterGender.Other,
            synopsis: "",
        };
    }

    triggerUpdate();
};

const getScreenplayElementType = (nodeType: string): ScreenplayElement => {
    switch (nodeType) {
        case "scene":
            return ScreenplayElement.Scene;
        case "action":
            return ScreenplayElement.Action;
        case "character":
            return ScreenplayElement.Character;
        case "dialogue":
            return ScreenplayElement.Dialogue;
        case "parenthetical":
            return ScreenplayElement.Parenthetical;
        case "transition":
            return ScreenplayElement.Transition;
        case "section":
            return ScreenplayElement.Section;
        case "note":
            return ScreenplayElement.Note;
        default:
            return ScreenplayElement.None;
    }
};

const getNodeData = (node: any): NodeData => {
    const type: string = node["attrs"]["class"];
    const content: any[] = node["content"];
    const flattenText = getNodeFlattenContent(content);

    return {
        type: getScreenplayElementType(type),
        content,
        flattenText,
    };
};

const getNodeFlattenContent = (content: any[]) => {
    if (!content) return "";

    let text = "";
    for (let i = 0; i < content.length; i++) {
        text += content[i]["text"];
    }

    return text;
};

const getScenePreview = (nodes: any[], cursor: number) => {
    let preview = "";

    for (let i = cursor; i < nodes.length && preview.length <= 30; i++) {
        const node = getNodeData(nodes[i]);
        if (node.type === ScreenplayElement.None) continue;
        if (node.type === ScreenplayElement.Scene) break; // stop when next scene is found (preview is 30 characters max

        preview += node.flattenText + " ";
    }

    return preview;
};

export const computeFullScenesData = async (json: any) => {
    const nodes = json.content!;
    const scenes: ScenesData = [];
    let cursor = 1;
    let sceneNumber = 0;

    for (let i = 0; i < nodes.length; i++) {
        const node = getNodeData(nodes[i]);

        if (node.type === ScreenplayElement.None) {
            cursor += 2; // empty screenplay element count for new line
            continue;
        }

        if (node.type === ScreenplayElement.Scene) {
            if (sceneNumber !== 0) {
                // first scene has no previous scene to set nextPosition
                scenes[scenes.length - 1].nextPosition = cursor;
            }

            scenes.push({
                position: cursor,
                nextPosition: -1,
                title: node.flattenText.toUpperCase(),
                preview: getScenePreview(nodes, i + 1),
            });

            sceneNumber++;
        }

        cursor += node.flattenText.length + 2; // new line counts for 2 characters
    }

    if (scenes.length > 0) {
        scenes[scenes.length - 1].nextPosition = cursor; // last scene has no next scene to set nextPosition
    }

    scenesData = scenes;
};

/*
export const updateScenesData = (transaction: any) => {
    const maps = transaction.mapping.maps;
    for (let i = 0; i < maps.length; i++) {
        const ranges = maps[i].ranges;
        for (let j = 0; j < ranges.length; j += 3) {
            const cursor = ranges[j];
            const oldSize = ranges[j + 1];
            const newSize = ranges[j + 2];
            const diff = newSize - oldSize;

            for (let k = 0; k < scenesData.length; k++) {
                if (scenesData[k].position < cursor) {
                    continue; // scene is before the change, no need to update
                }
                scenesData[k].position += diff;
            }
        }
    }
};
*/
