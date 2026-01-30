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
function computeBookmarkDecorations(
    doc: any,
    getSceneColor: (sceneId: string) => string | undefined,
): DecorationSet {
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
                        apply(tr, _oldDecorations) {
                            return computeBookmarkDecorations(tr.doc, getSceneColor);
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
