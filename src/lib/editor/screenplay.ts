import { JSONContent } from "@tiptap/react";
import { ScreenplayElement } from "../utils/enums";
import { ProjectContextType } from "@src/context/ProjectContext";

/* Nodes */
export type NodeData = {
    type: ScreenplayElement;
    content: any[]; // contains marks (bold, italic, etc.)
    text: string; // contains only text
};

/* Scenes */
export type ScenesData = SceneItem[];
export type SceneItem = {
    title: string;
    preview: string;
    position: number;
    nextPosition: number;
};

export const countOccurrences = (screenplay: JSONContent, word: string): number => {
    const regex = new RegExp(`${word}`, "gi");
    const nodes = screenplay.content!;
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

export const getNodeData = (node: JSONContent): NodeData => {
    const type: ScreenplayElement = node.attrs?.class;
    const content: JSONContent[] = node.content!;
    const text = getNodeFlattenContent(content);

    return {
        type,
        content,
        text,
    };
};

const getScenePreview = (nodes: JSONContent[], cursor: number) => {
    let preview = "";

    for (let i = cursor; i < nodes.length && preview.length <= 30; i++) {
        const node = getNodeData(nodes[i]);
        if (node.type === ScreenplayElement.None) continue;
        if (node.type === ScreenplayElement.Scene) break; // stop when next scene is found (preview is 30 characters max)

        preview += node.text + " ";
    }

    return preview;
};

export const computeFullScenesData = async (screenplay: JSONContent, projectCtx: ProjectContextType) => {
    if (!screenplay.content) {
        projectCtx.updateScenesData([]);
        return;
    }

    const nodes = screenplay.content;
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
                title: node.text.toUpperCase(),
                preview: getScenePreview(nodes, i + 1),
            });

            sceneNumber++;
        }

        cursor += node.text.length + 2; // new line counts for 2 characters
    }

    if (scenes.length > 0) {
        scenes[scenes.length - 1].nextPosition = cursor; // last scene has no next scene to set nextPosition
    }

    projectCtx.updateScenesData(scenes);
};
