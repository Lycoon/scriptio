import { JSONContent } from "@tiptap/react";
import { ScreenplayElement } from "../utils/enums";
import { ScreenplayContextType } from "@src/context/ScreenplayContext";

/* Nodes */
export type NodeData = {
    type: ScreenplayElement;
    content: any[]; // contains marks (bold, italic, etc.)
    flattenText: string; // contains only text
};

/* Scenes */
export type ScenesData = SceneItem[];
export type SceneItem = {
    title: string;
    preview: string;
    position: number;
    nextPosition: number;
};

export const countOccurrences = (json: JSONContent, word: string): number => {
    const regex = new RegExp(`${word}`, "gi");
    const nodes = json.content!;
    let count = 0;

    for (let i = 0; i < nodes.length; i++) {
        const currNode = nodes[i];
        const content = currNode["content"];
        if (!content) continue;

        const text = content[0]["text"];
        const res = Array.from(text!.matchAll(regex));
        count += res.length;
    }

    return count;
};

export const getNodeFlattenContent = (content: any[]) => {
    if (!content) return "";

    let text = "";
    for (let i = 0; i < content.length; i++) {
        text += content[i]["text"];
    }

    return text;
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

const getScenePreview = (nodes: any[], cursor: number) => {
    let preview = "";

    for (let i = cursor; i < nodes.length && preview.length <= 30; i++) {
        const node = getNodeData(nodes[i]);
        if (node.type === ScreenplayElement.None) continue;
        if (node.type === ScreenplayElement.Scene) break; // stop when next scene is found (preview is 30 characters max)

        preview += node.flattenText + " ";
    }

    return preview;
};

export const computeFullScenesData = async (scriptioScreenplay: any, screenplayCtx: ScreenplayContextType) => {
    if (!scriptioScreenplay) {
        screenplayCtx.updateScenesData([]);
        return;
    }

    const nodes = scriptioScreenplay.content;
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

    screenplayCtx.updateScenesData(scenes);
};
