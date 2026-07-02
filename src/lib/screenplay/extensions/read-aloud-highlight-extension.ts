import { Editor, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Highlights the screenplay node currently being read aloud.
 *
 * The plugin holds a single node range, driven entirely from outside via
 * transaction metas (the read-aloud player lives above the editor in the
 * provider tree, so it can't feed state through ProjectContext). Setting the
 * meta to a range highlights that node; setting it to `null` clears it. The
 * range is mapped through document edits so it survives concurrent typing.
 */

interface HighlightRange {
    from: number;
    to: number;
}

const readAloudHighlightKey = new PluginKey<HighlightRange | null>("readAloudHighlight");
const SET_META = "readAloudHighlightSet";

export const createReadAloudHighlightExtension = () =>
    Extension.create({
        name: "readAloudHighlight",

        addProseMirrorPlugins() {
            return [
                new Plugin<HighlightRange | null>({
                    key: readAloudHighlightKey,
                    state: {
                        init: () => null,
                        apply(tr, value) {
                            // An explicit set/clear always wins (null clears).
                            if (tr.getMeta(SET_META) !== undefined) {
                                return tr.getMeta(SET_META) as HighlightRange | null;
                            }
                            if (!value) return null;
                            if (tr.docChanged) {
                                const from = tr.mapping.map(value.from, 1);
                                const to = tr.mapping.map(value.to, -1);
                                return from < to ? { from, to } : null;
                            }
                            return value;
                        },
                    },
                    props: {
                        decorations(state) {
                            const value = readAloudHighlightKey.getState(state);
                            if (!value || value.to > state.doc.content.size) return null;
                            return DecorationSet.create(state.doc, [
                                Decoration.node(value.from, value.to, { class: "read-aloud-current" }),
                            ]);
                        },
                    },
                }),
            ];
        },
    });

/** Highlight the node spanning [from, to] (node boundaries) as now-reading. */
export const setReadAloudHighlight = (editor: Editor, from: number, to: number) => {
    if (!editor || editor.isDestroyed || !editor.view) return;
    const dom = editor.view.dom as HTMLElement;
    // Anchor the focus mask (scriptio.css) on the current node's vertical centre,
    // measured in the editor's own coordinate space (difference of client rects,
    // so it's scroll-independent) — the fade then grades by distance from the
    // spoken line, continuously across nodes rather than per node.
    try {
        const { node } = editor.view.domAtPos(from + 1);
        const el = node instanceof HTMLElement ? node : node.parentElement;
        if (el) {
            const nodeRect = el.getBoundingClientRect();
            const domRect = dom.getBoundingClientRect();
            const center = nodeRect.top - domRect.top + nodeRect.height / 2;
            dom.style.setProperty("--ra-center", `${Math.round(center)}px`);
        }
    } catch {
        /* position transiently invalid during edits — keep the previous centre */
    }
    // Turn on focus mode: while this class is set the mask above lights the area
    // around --ra-center and fades the rest of the script.
    dom.classList.add("read-aloud-active");
    editor.view.dispatch(editor.state.tr.setMeta(SET_META, { from, to }));
};

/** Remove the read-aloud highlight. */
export const clearReadAloudHighlight = (editor: Editor) => {
    if (!editor || editor.isDestroyed || !editor.view) return;
    editor.view.dom.classList.remove("read-aloud-active");
    editor.view.dispatch(editor.state.tr.setMeta(SET_META, null));
};

/** Scroll the node starting just before `from` into view, centered. */
export const scrollReadAloudIntoView = (editor: Editor, from: number) => {
    if (!editor || editor.isDestroyed || !editor.view) return;
    try {
        const { node } = editor.view.domAtPos(from + 1);
        const el = node instanceof HTMLElement ? node : node.parentElement;
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
        /* position may be transiently invalid during edits — ignore */
    }
};
