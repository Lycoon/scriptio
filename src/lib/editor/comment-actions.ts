import type { Editor } from "@tiptap/react";

/**
 * "Comment on this node" handlers, keyed by the editor they belong to.
 *
 * Comments live in a per-document Y.Map that only the owning DocumentEditorPanel
 * resolves (see `config.getCommentsMap`), and creating one must also open its
 * thread — panel-local state. The desktop context menu is rendered by that panel
 * so it just closes over the handler; MobileFormatToolbar sits at the workspace
 * root, outside every panel, and has no route to either. Each panel publishes its
 * handler here on mount so the toolbar can look one up by the focused editor.
 *
 * A WeakMap so a destroyed editor's entry disappears with it, and keyed by the
 * editor instance rather than a single global slot because several panels
 * (screenplay, shelf draft, tree document) are mounted at once.
 */
const addCommentHandlers = new WeakMap<Editor, (nodeId: string) => void>();

export const registerAddComment = (editor: Editor, addComment: (nodeId: string) => void) => {
    addCommentHandlers.set(editor, addComment);
};

export const unregisterAddComment = (editor: Editor) => {
    addCommentHandlers.delete(editor);
};

/** The editor's "comment on this node" handler, or null if it has no comments. */
export const getAddComment = (editor: Editor): ((nodeId: string) => void) | null =>
    addCommentHandlers.get(editor) ?? null;
