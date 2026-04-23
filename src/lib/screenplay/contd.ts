import { getNodeFlattenContent } from "./screenplay";
import { JSONContent } from "@tiptap/react";

/**
 * Computes which character node indices should display "(CONT'D)" suffix.
 * A character gets CONT'D when their dialogue is interrupted by elements
 * that are NOT scene headings or other character cues.
 *
 * @param screenplay - The TipTap screenplay document
 * @returns A Set of node indices that should have CONT'D appended
 */
export function computeContdIndices(screenplay: JSONContent[]): Set<number> {
    const contdIndices = new Set<number>();

    if (!screenplay || screenplay.length === 0) return contdIndices;

    let lastCharacterInScene: string | null = null;
    let wasInterrupted = false;

    for (let i = 0; i < screenplay.length; i++) {
        const node = screenplay[i];
        const type: string = node.attrs?.class;

        // Scene headings reset tracking (new scene = no CONT'D)
        if (type === "scene") {
            lastCharacterInScene = null;
            wasInterrupted = false;
            continue;
        }

        if (type === "character") {
            const characterName = getCharacterName(node);

            if (wasInterrupted && lastCharacterInScene === characterName) {
                contdIndices.add(i);
            }

            lastCharacterInScene = characterName;
            wasInterrupted = false;
        }

        // Dialogue and parenthetical are part of the character's speech block
        if (type === "dialogue" || type === "parenthetical") {
            continue;
        }

        // Any other element interrupts the dialogue
        if (lastCharacterInScene !== null) {
            wasInterrupted = true;
        }
    }

    return contdIndices;
}

/**
 * Extracts character name from a node, normalized for comparison.
 */
function getCharacterName(node: JSONContent): string {
    const text = getNodeFlattenContent(node.content ?? []);
    return (text || "").trim().toUpperCase();
}
