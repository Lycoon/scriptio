import { Editor, Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        comment: {
            setComment: (commentId: string) => ReturnType;
            unsetComment: (commentId: string) => ReturnType;
        };
    }
}

export type CommentOptions = {
    HTMLAttributes: Record<string, any>;
    onCommentActivated: (commentId: string | null) => void;
};

export type CommentStorage = {
    activeCommentId: string | null;
};

const activeCommentPluginKey = new PluginKey("activeCommentHighlight");

export const CommentMark = Mark.create<CommentOptions, CommentStorage>({
    name: "comment",

    addOptions() {
        return {
            HTMLAttributes: {},
            onCommentActivated: () => {},
        };
    },

    addAttributes() {
        return {
            commentId: {
                default: null,
                parseHTML: (el: HTMLElement) => el.getAttribute("data-comment-id"),
                renderHTML: (attrs) => ({
                    "data-comment-id": attrs.commentId,
                }),
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: "span[data-comment-id]",
                getAttrs: (el) => {
                    const id = (el as HTMLElement).getAttribute("data-comment-id")?.trim();
                    return id ? null : false;
                },
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            "span",
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                class: "comment-highlight",
            }),
            0,
        ];
    },

    onSelectionUpdate() {
        const { $from } = this.editor.state.selection;
        const marks = $from.marks();
        const commentMark = marks.find((mark) => mark.type.name === "comment");
        const newId = commentMark?.attrs.commentId || null;

        if (newId !== this.storage.activeCommentId) {
            this.storage.activeCommentId = newId;
            this.options.onCommentActivated(newId);
        }
    },

    addStorage() {
        return {
            activeCommentId: null,
        };
    },

    addCommands() {
        return {
            setComment:
                (commentId: string) =>
                ({ commands }) => {
                    if (!commentId) return false;
                    return commands.setMark("comment", { commentId });
                },

            unsetComment:
                (commentId: string) =>
                ({ tr, dispatch }) => {
                    if (!commentId) return false;

                    const marksToRemove: { mark: any; from: number; to: number }[] = [];

                    tr.doc.descendants((node, pos) => {
                        const commentMark = node.marks.find(
                            (mark) => mark.type.name === "comment" && mark.attrs.commentId === commentId,
                        );
                        if (commentMark) {
                            marksToRemove.push({
                                mark: commentMark,
                                from: pos,
                                to: pos + node.nodeSize,
                            });
                        }
                    });

                    marksToRemove.forEach(({ mark, from, to }) => {
                        tr.removeMark(from, to, mark);
                    });

                    if (dispatch) dispatch(tr);
                    return true;
                },
        };
    },

    addProseMirrorPlugins() {
        const extensionStorage = this.storage;

        return [
            new Plugin({
                key: activeCommentPluginKey,
                props: {
                    decorations(state) {
                        const activeId = extensionStorage.activeCommentId;
                        if (!activeId) return DecorationSet.empty;

                        const decorations: Decoration[] = [];

                        state.doc.descendants((node, pos) => {
                            const commentMark = node.marks.find(
                                (mark) =>
                                    mark.type.name === "comment" && mark.attrs.commentId === activeId,
                            );
                            if (commentMark) {
                                decorations.push(
                                    Decoration.inline(pos, pos + node.nodeSize, {
                                        class: "comment-highlight-active",
                                    }),
                                );
                            }
                        });

                        return DecorationSet.create(state.doc, decorations);
                    },
                },
            }),
        ];
    },
});

/**
 * Scan the document for comment marks and return their positions.
 * Returns a Map of commentId -> { from, to } with the full range of each comment.
 */
export const getCommentPositions = (editor: Editor): Map<string, { from: number; to: number }> => {
    if (!editor || editor.isDestroyed) return new Map();

    const positions = new Map<string, { from: number; to: number }>();

    editor.state.doc.descendants((node, pos) => {
        const commentMark = node.marks.find((mark) => mark.type.name === "comment");
        if (!commentMark) return;

        const id = commentMark.attrs.commentId;
        const existing = positions.get(id);
        const nodeEnd = pos + node.nodeSize;

        if (existing) {
            // Extend range to include this node
            positions.set(id, {
                from: Math.min(existing.from, pos),
                to: Math.max(existing.to, nodeEnd),
            });
        } else {
            positions.set(id, { from: pos, to: nodeEnd });
        }
    });

    return positions;
};
