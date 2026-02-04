import { Editor, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ReplaceAroundStep } from "@tiptap/pm/transform";

const sceneNumberRightPluginKey = new PluginKey("sceneNumberRight");

type SceneNumberRightConfig = {
    isEnabled: () => boolean;
};

/**
 * Computes widget decorations for scene headings to show scene numbers on the right.
 * Uses actual DOM elements to avoid conflicts with the bookmark's ::after pseudo-element.
 */
function computeSceneNumberDecorations(
    doc: any,
    isEnabled: () => boolean,
): DecorationSet {
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
                            if (!tr.docChanged) return oldDecorations;

                            // Only recompute when scenes might be added/deleted
                            // (structural changes with block content in slice)
                            const hasStructuralChange = tr.steps.some((step: any) => {
                                if (step instanceof ReplaceAroundStep) return true;
                                if (step.slice && step.slice.content) {
                                    for (let i = 0; i < step.slice.content.childCount; i++) {
                                        if (step.slice.content.child(i).isBlock) return true;
                                    }
                                }
                                return false;
                            });

                            if (hasStructuralChange) {
                                return computeSceneNumberDecorations(tr.doc, isEnabled);
                            }

                            // Simple text edit — just remap positions (O(log n))
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
};

/**
 * Force the editor to recompute scene number right decorations.
 * Call this when the sceneNumberOnRight setting changes.
 */
export const refreshSceneNumberRight = (editor: Editor) => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta("sceneNumberRightRefresh", true));
};
