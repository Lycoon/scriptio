import { Editor, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const sceneBookmarkPluginKey = new PluginKey("sceneBookmark");

type SceneBookmarkConfig = {
    getSceneColor: (sceneId: string) => string | undefined;
};

/**
 * Computes decorations for scene headings that have an assigned color.
 * Adds a bookmark decoration on the left edge of the scene heading.
 */
function computeBookmarkDecorations(doc: any, getSceneColor: (sceneId: string) => string | undefined): DecorationSet {
    const decorations: Decoration[] = [];

    doc.forEach((node: any, pos: number) => {
        if (node.attrs?.class !== "scene") return;

        const sceneId: string | undefined = node.attrs?.["scene-id"];
        if (!sceneId) return;

        const color = getSceneColor(sceneId);
        if (!color) return;

        decorations.push(
            Decoration.node(pos, pos + node.nodeSize, {
                class: "scene-bookmark",
                style: `--scene-color: ${color}`,
            }),
        );
    });

    return DecorationSet.create(doc, decorations);
}

/**
 * Check if the transaction affects any Scene nodes (which would require recomputation).
 * Uses nodesBetween on both old and new docs to accurately check if the affected
 * range overlaps with a scene node, avoiding false positives from adjacent nodes.
 */
function didSceneNodesChange(tr: any): boolean {
    if (!tr.docChanged) return false;

    for (const step of tr.steps) {
        const stepMap = step.getMap();
        let affectsScene = false;
        stepMap.forEach((oldStart: number, oldEnd: number, newStart: number, newEnd: number) => {
            // Check old doc: did the change occur inside a scene node?
            try {
                const oldDoc = tr.docs[0];
                if (oldDoc) {
                    oldDoc.nodesBetween(oldStart, oldEnd, (node: any) => {
                        if (node.attrs?.class === "scene") affectsScene = true;
                    });
                }
            } catch { /* position out of bounds */ }

            // Check new doc: did the change produce a scene node?
            try {
                tr.doc.nodesBetween(newStart, newEnd, (node: any) => {
                    if (node.attrs?.class === "scene") affectsScene = true;
                });
            } catch { /* position out of bounds */ }
        });
        if (affectsScene) return true;
    }

    return false;
}

export const createSceneBookmarkExtension = (config: SceneBookmarkConfig) => {
    return Extension.create({
        name: "sceneBookmark",

        addProseMirrorPlugins() {
            const { getSceneColor } = config;

            return [
                new Plugin({
                    key: sceneBookmarkPluginKey,
                    state: {
                        init(_, { doc }) {
                            return computeBookmarkDecorations(doc, getSceneColor);
                        },
                        apply(tr, oldDecorations, _oldState, newState) {
                            // Always recompute when explicitly refreshed (color changed from UI)
                            if (tr.getMeta("sceneBookmarkRefresh")) {
                                return computeBookmarkDecorations(tr.doc, getSceneColor);
                            }

                            // If document changed, check if Scene nodes were affected
                            if (tr.docChanged) {
                                if (didSceneNodesChange(tr)) {
                                    return computeBookmarkDecorations(tr.doc, getSceneColor);
                                }
                                // Simple text edit - just map existing decorations to new positions
                                return oldDecorations.map(tr.mapping, newState.doc);
                            }

                            return oldDecorations;
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
 * Force the editor to recompute scene bookmark decorations.
 * Call this when scenes or their colors change.
 */
export const refreshSceneBookmarks = (editor: Editor) => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta("sceneBookmarkRefresh", true));
};
