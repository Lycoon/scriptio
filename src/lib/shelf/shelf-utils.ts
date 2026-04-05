import { Editor } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { JSONContent } from "@tiptap/react";
import { ScreenplayElement } from "../utils/enums";
import { ShelfEntryType } from "../project/project-state";

export interface ShelveCandidate {
    nodeId: string;
    title: string;
    type: ShelfEntryType;
    content: JSONContent[];
}

/**
 * Given a position in the document, determine the shelvable content.
 * Returns null if the node at the position is not shelvable.
 */
export function extractShelveCandidate(editor: Editor, pos: number): ShelveCandidate | null {
    const doc = editor.state.doc;
    const $pos = doc.resolve(pos);
    const node = $pos.parent;
    const nodeClass = node.attrs.class as ScreenplayElement;
    const nodeId: string | null = node.attrs["data-id"] ?? null;

    if (!nodeId) return null;

    const docChildIndex = $pos.index(0);

    switch (nodeClass) {
        case ScreenplayElement.Scene:
            return extractSceneContent(doc, docChildIndex, nodeId, node.textContent);
        case ScreenplayElement.Character:
            return extractDialogueBlockContent(doc, docChildIndex, nodeId, node.textContent);
        case ScreenplayElement.Action:
            return { nodeId, title: node.textContent, type: "action", content: [node.toJSON()] };
        default:
            return null;
    }
}

/** Collect from scene heading until next scene heading or end of doc. */
function extractSceneContent(
    doc: ProseMirrorNode,
    startIndex: number,
    nodeId: string,
    title: string,
): ShelveCandidate {
    const content: JSONContent[] = [];
    const count = doc.childCount;

    content.push(doc.child(startIndex).toJSON());

    for (let i = startIndex + 1; i < count; i++) {
        const child = doc.child(i);
        if (child.attrs.class === ScreenplayElement.Scene) break;
        content.push(child.toJSON());
    }

    return { nodeId, title, type: "scene", content };
}

/** Collect a dialogue block: character + consecutive dialogue/parenthetical nodes. */
function extractDialogueBlockContent(
    doc: ProseMirrorNode,
    startIndex: number,
    nodeId: string,
    title: string,
): ShelveCandidate {
    const content: JSONContent[] = [];
    const count = doc.childCount;

    content.push(doc.child(startIndex).toJSON());

    for (let i = startIndex + 1; i < count; i++) {
        const cls = doc.child(i).attrs.class;
        if (
            cls === ScreenplayElement.Dialogue ||
            cls === ScreenplayElement.Parenthetical ||
            cls === ScreenplayElement.Character
        ) {
            content.push(doc.child(i).toJSON());
        } else {
            break;
        }
    }

    return { nodeId, title, type: "character", content };
}
