import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ReplaceAroundStep } from "@tiptap/pm/transform";

const contdPluginKey = new PluginKey("contd");

/**
 * Checks if a transaction structurally changes dialogue blocks
 * (adding/deleting nodes, or modifying character/scene nodes).
 * Simple text edits within an existing node don't affect CONT'D logic.
 */
function didDialogueBlockChange(tr: any): boolean {
    // ReplaceAroundStep means nodes were wrapped/unwrapped (structural change)
    if (tr.steps.some((step: any) => step instanceof ReplaceAroundStep)) {
        return true;
    }

    for (const step of tr.steps) {
        // If the step's slice contains block nodes, it's a structural change
        if (step.slice && step.slice.content && step.slice.content.childCount > 0) {
            for (let i = 0; i < step.slice.content.childCount; i++) {
                const child = step.slice.content.child(i);
                if (child.isBlock) return true;
            }
        }
    }

    return false;
}

/**
 * Computes decorations for character nodes that should display "(CONT'D)".
 * Works directly with ProseMirror doc tree (avoids expensive doc.toJSON() serialization).
 */
function computeContdDecorations(doc: any): DecorationSet {
    // Single pass: compute CONT'D indices and build decorations together
    const contdIndices = new Set<number>();
    let lastCharacterInScene: string | null = null;
    let wasInterrupted = false;
    let nodeIndex = 0;

    // First pass: determine which indices need CONT'D
    doc.forEach((node: any) => {
        const type: string = node.attrs?.class;

        if (type === "scene") {
            lastCharacterInScene = null;
            wasInterrupted = false;
        } else if (type === "character") {
            const characterName = (node.textContent || "").trim().toUpperCase();
            if (wasInterrupted && lastCharacterInScene === characterName) {
                contdIndices.add(nodeIndex);
            }
            lastCharacterInScene = characterName;
            wasInterrupted = false;
        } else if (type === "dialogue" || type === "parenthetical") {
            // Part of character's speech block — don't interrupt
        } else {
            if (lastCharacterInScene !== null) {
                wasInterrupted = true;
            }
        }
        nodeIndex++;
    });

    if (contdIndices.size === 0) {
        return DecorationSet.empty;
    }

    // Second pass: create decorations for marked indices
    const decorations: Decoration[] = [];
    nodeIndex = 0;

    doc.forEach((node: any, pos: number) => {
        if (contdIndices.has(nodeIndex)) {
            decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                    class: "contd",
                })
            );
        }
        nodeIndex++;
    });

    return DecorationSet.create(doc, decorations);
}

export const ContdExtension = Extension.create({
    name: "contd",

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: contdPluginKey,
                state: {
                    init(_, { doc }) {
                        return computeContdDecorations(doc);
                    },
                    apply(tr, oldDecorations, _oldState, newState) {
                        if (!tr.docChanged) return oldDecorations;

                        // Only recompute when dialogue block structure changes
                        // (new nodes added/deleted, node types changed)
                        if (didDialogueBlockChange(tr)) {
                            return computeContdDecorations(tr.doc);
                        }

                        // Simple text edit within existing node — just remap positions (O(log n))
                        return oldDecorations.map(tr.mapping, newState.doc);
                    },
                },
                props: {
                    decorations(state) {
                        return this.getState(state);
                    },
                },
            }),
        ];
    },
});
