import { Node, mergeAttributes } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { ScreenplayElement } from "../../utils/enums";
import { ALIGN_CLASSES, generateNodeId } from "./index";

export interface SceneNodeOptions {
    HTMLAttributes: Record<string, unknown>;
}

/**
 * Scene heading node.
 * The data-id attribute is used to link a scene heading to persistent
 * scene data (synopsis, color) stored in the Yjs document.
 */
export const SceneNode = Node.create<SceneNodeOptions>({
    name: ScreenplayElement.Scene,
    group: "block",
    content: "text*",
    defining: true,
    draggable: false,

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            "data-id": {
                default: () => generateNodeId(),
                parseHTML: (element) => element.getAttribute("data-id") || null,
                renderHTML: (attributes) => attributes["data-id"] ? { "data-id": attributes["data-id"] } : {},
            },
            class: {
                default: ScreenplayElement.Scene,
                parseHTML: (element) => element.getAttribute("class")?.split(" ")[0] || ScreenplayElement.Scene,
            },
            textAlign: {
                default: null,
                parseHTML: (element) => {
                    if (element.classList.contains("align-center")) return "center";
                    if (element.classList.contains("align-right")) return "right";
                    return null;
                },
                renderHTML: (attributes) => {
                    if (!attributes.textAlign) return {};
                    const cls = ALIGN_CLASSES[attributes.textAlign];
                    return cls ? { class: cls } : {};
                },
            },
            height: {
                default: null,
                renderHTML: (attributes) => attributes.height != null ? { "data-height": attributes.height } : {},
                parseHTML: (element) => {
                    const v = element.getAttribute("data-height");
                    return v !== null ? parseInt(v, 10) : null;
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: "p",
                getAttrs: (element) => {
                    const el = element as HTMLElement;
                    if (el.classList.contains(ScreenplayElement.Scene)) {
                        return {};
                    }
                    return false;
                },
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["p", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
    },

    addKeyboardShortcuts() {
        return {
            Backspace: ({ editor }) => {
                const { state, view } = editor;
                const { $from, empty } = state.selection;
                if (!empty || $from.parentOffset !== 0) return false;

                // Case 1: cursor inside an empty Scene heading → delete the
                // Scene itself (unless it's the only block in the document).
                // After deletion, drop the cursor at the end of the previous
                // block — default PM selection mapping moves it forward into
                // the *next* block instead, which feels wrong here.
                if ($from.parent.type === this.type) {
                    if ($from.parent.textContent.length === 0 && state.doc.childCount > 1) {
                        const pos = $from.before();
                        const tr = state.tr.delete(pos, pos + $from.parent.nodeSize);
                        if (pos > 0) {
                            tr.setSelection(TextSelection.create(tr.doc, pos - 1));
                        }
                        view.dispatch(tr);
                        return true;
                    }
                    return false;
                }

                // Case 2: cursor at the start of an empty block whose
                // immediately preceding sibling is a Scene heading. Default
                // ProseMirror `joinBackward` would delete the Scene above
                // (joinMaybeClear deletes the empty `before` block), leaving
                // the empty current block orphaned. Intercept and delete the
                // current block instead, dropping the cursor into the Scene.
                if ($from.parent.textContent.length !== 0) return false;

                const curStart = $from.before();
                if (curStart === 0) return false;

                const prev = state.doc.resolve(curStart).nodeBefore;
                if (!prev || prev.type !== this.type) return false;

                const cursorTarget = curStart - 1;
                const tr = state.tr.delete(curStart, $from.after());
                tr.setSelection(TextSelection.create(tr.doc, cursorTarget));
                view.dispatch(tr);
                return true;
            },
            Enter: ({ editor }) => {
                const { state, view } = editor;
                const { $from, empty } = state.selection;

                if (empty && $from.parent.type === this.type && $from.parentOffset === 0) {
                    // If the node is completely empty, let Tiptap handle it (converts to Action)
                    if ($from.parent.textContent.length === 0) {
                        return false;
                    }

                    // Split the block. We want the node AFTER the split (which contains the text)
                    // to keep its original data-id, and the new empty node BEFORE the split
                    // to get a new data-id. Since tr.split by default copies the original node's
                    // attributes to both halves, we can split, and then update the attributes of
                    // the newly created empty node (which will be right before $from.pos).
                    const originalAttrs = $from.parent.attrs;
                    let tr = state.tr.split($from.pos, 1, [{ type: this.type, attrs: originalAttrs }]);
                    
                    // After the split, the original node with its text is pushed down.
                    // A new empty node is created above it. The new node starts at $from.pos - 1
                    // (the start of the block). We update its data-id.
                    const newNodePos = $from.pos - 1;
                    tr = tr.setNodeMarkup(newNodePos, undefined, {
                        ...originalAttrs,
                        "data-id": generateNodeId()
                    });
                    
                    view.dispatch(tr);
                    return true;
                }
                return false;
            },
        };
    },
});