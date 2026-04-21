import { JSONContent } from "@tiptap/react";
import { ScreenplayElement } from "../utils/enums";

/* Nodes */
export type NodeData = {
    type: ScreenplayElement;
    content: JSONContent[]; // contains marks (bold, italic, etc.)
    flattenText: string; // contains only text
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

export const getNodeFlattenContent = (node: JSONContent[]) => {
    if (!node) return "";

    let text = "";
    for (let i = 0; i < node.length; i++) {
        text += node[i]["text"];
    }

    return text;
};

export const getNodeData = (node: JSONContent): NodeData => {
    const type = node.type as ScreenplayElement;
    const content: JSONContent[] = node.content!;
    const flattenText = getNodeFlattenContent(content);

    return {
        type,
        content,
        flattenText,
    };
};
