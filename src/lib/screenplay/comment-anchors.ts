import { Editor } from "@tiptap/core";
import { EditorState, Transaction } from "@tiptap/pm/state";

export type NodePosition = { from: number; to: number };

/**
 * Scan the document for block nodes and return a map of node `data-id` to its
 * position range. Comments are anchored to nodes by `data-id`, so this lets the
 * gutter and sidebar resolve a comment's on-screen location from its `nodeId`.
 * The first occurrence of each id wins (ids are unique in a well-formed doc).
 */
export const getNodePositions = (editor: Editor | null): Map<string, NodePosition> => {
    const positions = new Map<string, NodePosition>();
    if (!editor || editor.isDestroyed) return positions;

    editor.state.doc.descendants((node, pos) => {
        const id = node.attrs?.["data-id"] as string | undefined;
        if (id && !positions.has(id)) {
            positions.set(id, { from: pos + 1, to: pos + node.nodeSize - 1 });
        }
    });

    return positions;
};

/**
 * Whether a transaction removed at least one anchorable block node — i.e. a node
 * with a `data-id` that was wholly deleted (not merely edited or moved). Used to
 * gate orphaned-comment pruning so it never runs on ordinary typing/insertions.
 */
export const transactionDeletesNode = (tr: Transaction): boolean => {
    if (!tr.docChanged) return false;

    // Ids of block nodes wholly contained in a removed range.
    const removed = new Set<string>();
    tr.steps.forEach((step, i) => {
        const oldDoc = tr.docs[i];
        if (!oldDoc) return;
        step.getMap().forEach((oldStart, oldEnd) => {
            if (oldEnd <= oldStart) return; // pure insertion — nothing removed
            oldDoc.nodesBetween(oldStart, oldEnd, (node, pos) => {
                const id = node.attrs?.["data-id"];
                if (typeof id === "string" && pos >= oldStart && pos + node.nodeSize <= oldEnd) {
                    removed.add(id);
                }
            });
        });
    });
    if (removed.size === 0) return false;

    // Confirm at least one candidate is truly gone from the result (not moved).
    const live = new Set<string>();
    tr.doc.descendants((node) => {
        const id = node.attrs?.["data-id"];
        if (typeof id === "string") live.add(id);
    });
    for (const id of removed) {
        if (!live.has(id)) return true;
    }
    return false;
};

/**
 * Resolve the `data-id` of the nearest block ancestor at the given position.
 * Used when creating a comment so it anchors to the node under the caret.
 */
export const getNodeIdAtPos = (state: EditorState, pos: number): string | null => {
    try {
        const $pos = state.doc.resolve(pos);
        for (let d = $pos.depth; d >= 0; d--) {
            const id = $pos.node(d).attrs?.["data-id"] as string | undefined;
            if (id) return id;
        }
    } catch {
        // Position out of range
    }
    return null;
};
