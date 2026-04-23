import { Extension } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ReplaceAroundStep, ReplaceStep, Step } from "@tiptap/pm/transform";
import { STRUCTURAL_REFRESH_META, scheduleStructuralRefresh, cancelStructuralRefresh } from "./structural-refresh";

const contdPluginKey = new PluginKey("contd");

// Deferred recomputation flag — set in apply(), checked in view.update()
let contdNeedsRecompute = false;

/**
 * Checks if a transaction structurally changes dialogue blocks or edits a
 * character node's text content (which affects CONT'D name matching).
 */
function didDialogueBlockChange(tr: Transaction, oldDoc: Node): boolean {
    // ReplaceAroundStep means nodes were wrapped/unwrapped (structural change)
    if (tr.steps.some((step: Step) => step instanceof ReplaceAroundStep)) {
        return true;
    }

    for (const step of tr.steps) {
        if (!(step instanceof ReplaceStep)) continue;
        // Block-level content insertion (structural change)
        for (let i = 0; i < step.slice.content.childCount; i++) {
            if (step.slice.content.child(i).isBlock) return true;
        }
        // Text edit within a character node — name changes affect CONT'D matching
        const $from = oldDoc.resolve(step.from);
        if ($from.parent.attrs?.class === "character") return true;
    }

    return false;
}

/**
 * Computes decorations for character nodes that should display "(CONT'D)".
 * Works directly with ProseMirror doc tree (avoids expensive doc.toJSON() serialization).
 */
function computeContdDecorations(doc: Node): DecorationSet {
    // Single pass: compute CONT'D indices and build decorations together
    const contdIndices = new Set<number>();
    let lastCharacterInScene: string | null = null;
    let wasInterrupted = false;
    let nodeIndex = 0;

    // First pass: determine which indices need CONT'D
    doc.forEach((node: Node) => {
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

    doc.forEach((node: Node, pos: number) => {
        if (contdIndices.has(nodeIndex)) {
            decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                    class: "contd",
                }),
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
                        // Full recompute on deferred structural refresh
                        if (tr.getMeta(STRUCTURAL_REFRESH_META)) {
                            contdNeedsRecompute = false;
                            return computeContdDecorations(tr.doc);
                        }

                        if (!tr.docChanged) return oldDecorations;

                        // On structural change: defer full recompute to next frame,
                        // return fast O(log n) position remap for now.
                        // Also detect node deletion via Backspace/Delete (childCount changes).
                        if (_oldState.doc.childCount !== newState.doc.childCount || didDialogueBlockChange(tr, _oldState.doc)) {
                            contdNeedsRecompute = true;
                            return oldDecorations.map(tr.mapping, newState.doc);
                        }

                        // Simple text edit within existing node — just remap positions (O(log n))
                        return oldDecorations.map(tr.mapping, newState.doc);
                    },
                },
                view() {
                    return {
                        update(view) {
                            if (contdNeedsRecompute) {
                                scheduleStructuralRefresh(view);
                            }
                        },
                        destroy() {
                            cancelStructuralRefresh();
                        },
                    };
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
