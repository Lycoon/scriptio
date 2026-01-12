import { Screenplay } from "../utils/types";
import { getNodeFlattenContent } from "./screenplay";

/**
 * Computes which character node indices should display "(CONT'D)" suffix.
 * A character gets CONT'D when their dialogue is interrupted by elements
 * that are NOT scene headings or other character cues.
 *
 * @param screenplay - The TipTap screenplay document
 * @returns A Set of node indices that should have CONT'D appended
 */
export function computeContdIndices(screenplay: Screenplay): Set<number> {
    const contdIndices = new Set<number>();
    const nodes = screenplay.content;

    if (!nodes || nodes.length === 0) return contdIndices;

    let lastCharacterInScene: string | null = null;
    let wasInterrupted = false;

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
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
            continue;
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
function getCharacterName(node: any): string {
    const text = getNodeFlattenContent(node.content);
    return (text || "").trim().toUpperCase();
}
