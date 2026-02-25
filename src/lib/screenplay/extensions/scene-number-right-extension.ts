import { Editor, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ReplaceAroundStep } from "@tiptap/pm/transform";
import { STRUCTURAL_REFRESH_META, scheduleStructuralRefresh, cancelStructuralRefresh } from "./structural-refresh";

const sceneNumberRightPluginKey = new PluginKey("sceneNumberRight");

// Deferred recomputation flag — set in apply(), checked in view.update()
let sceneNumNeedsRecompute = false;

type SceneNumberRightConfig = {
    isEnabled: () => boolean;
};

/** Counts the number of scene heading nodes in the document. */
function getSceneCount(doc: any): number {
    let count = 0;
    doc.forEach((node: any) => {
        if (node.attrs?.class === "scene") count++;
    });
    return count;
}

/**
 * Computes widget decorations for scene headings to show scene numbers on the right.
 * Uses actual DOM elements to avoid conflicts with the bookmark's ::after pseudo-element.
 */
function computeSceneNumberDecorations(doc: any, isEnabled: () => boolean): DecorationSet {
    if (!isEnabled()) {
        return DecorationSet.empty;
    }

    const decorations: Decoration[] = [];
    let sceneNumber = 0;

    doc.forEach((node: any, pos: number) => {
        if (node.attrs?.class !== "scene") return;

        sceneNumber++;
        const currentSceneNumber = sceneNumber; // Capture value for closure

        // Create a widget decoration at the end of the scene node
        const widget = Decoration.widget(
            pos + node.nodeSize - 1, // Position at the end of the node content
            () => {
                const span = document.createElement("span");
                span.className = "scene-number-right";
                span.textContent = String(currentSceneNumber);
                span.contentEditable = "false";
                return span;
            },
            { side: 1 }, // Place after the content
        );

        decorations.push(widget);
    });

    return DecorationSet.create(doc, decorations);
}

export const createSceneNumberRightExtension = (config: SceneNumberRightConfig) => {
    return Extension.create({
        name: "sceneNumberRight",

        addProseMirrorPlugins() {
            const { isEnabled } = config;

            return [
                new Plugin({
                    key: sceneNumberRightPluginKey,
                    state: {
                        init(_, { doc }) {
                            return computeSceneNumberDecorations(doc, isEnabled);
                        },
                        apply(tr, oldDecorations, _oldState, newState) {
                            // Always recompute when setting is toggled
                            if (tr.getMeta("sceneNumberRightRefresh")) {
                                return computeSceneNumberDecorations(tr.doc, isEnabled);
                            }

                            // Full recompute on deferred structural refresh
                            if (tr.getMeta(STRUCTURAL_REFRESH_META)) {
                                sceneNumNeedsRecompute = false;
                                return computeSceneNumberDecorations(tr.doc, isEnabled);
                            }

                            if (!tr.docChanged) return oldDecorations;

                            // Check if document structure changed (nodes added/deleted/merged)
                            // This catches:
                            // - ReplaceAroundStep (Enter key, wrapping)
                            // - Block content in slice (paste, insertContentAt)
                            // - Node deletion via Backspace/Delete (childCount changes)
                            const hasStructuralChange =
                                _oldState.doc.childCount !== newState.doc.childCount ||
                                tr.steps.some((step: any) => {
                                    if (step instanceof ReplaceAroundStep) return true;
                                    if (step.slice && step.slice.content) {
                                        for (let i = 0; i < step.slice.content.childCount; i++) {
                                            if (step.slice.content.child(i).isBlock) return true;
                                        }
                                    }
                                    return false;
                                });

                            if (hasStructuralChange) {
                                // Only defer recompute if scene count changed
                                // (i.e., a scene heading was added or removed)
                                if (getSceneCount(_oldState.doc) !== getSceneCount(newState.doc)) {
                                    sceneNumNeedsRecompute = true;
                                }
                                return oldDecorations.map(tr.mapping, newState.doc);
                            }

                            // Simple text edit — just remap positions (O(log n))
                            return oldDecorations.map(tr.mapping, newState.doc);
                        },
                    },
                    view() {
                        return {
                            update(view) {
                                if (sceneNumNeedsRecompute) {
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
};

/**
 * Force the editor to recompute scene number right decorations.
 * Call this when the sceneNumberOnRight setting changes.
 */
export const refreshSceneNumberRight = (editor: Editor) => {
    if (!editor || !editor.view) return;
    editor.view.dispatch(editor.state.tr.setMeta("sceneNumberRightRefresh", true));
};
