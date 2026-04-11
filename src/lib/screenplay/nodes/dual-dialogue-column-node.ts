import { Node, mergeAttributes } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { Node as PMNode } from "@tiptap/pm/model";
import { ScreenplayElement } from "../../utils/enums";
import { generateNodeId } from "./index";

export const DUAL_DIALOGUE_COLUMN = "dual_dialogue_column";

/**
 * Internal column wrapper for dual-dialogue.
 * Not part of the "block" group — can only appear as a child of dual-dialogue.
 * Holds a character cue plus optional parentheticals and the dialogue lines.
 */
export const DualDialogueColumnNode = Node.create({
    name: DUAL_DIALOGUE_COLUMN,
    content: "block+",
    defining: true,

    parseHTML() {
        return [
            {
                tag: "div",
                getAttrs: (element) => {
                    const el = element as HTMLElement;
                    return el.classList.contains(DUAL_DIALOGUE_COLUMN) ? {} : false;
                },
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["div", mergeAttributes({ class: DUAL_DIALOGUE_COLUMN }, HTMLAttributes), 0];
    },

    addKeyboardShortcuts() {
        /** Return the depth of the nearest dual_dialogue_column ancestor, or -1. */
        const findColumnDepth = ($from: { depth: number; node: (d: number) => PMNode }): number => {
            for (let d = $from.depth; d >= 1; d--) {
                if ($from.node(d).type.name === DUAL_DIALOGUE_COLUMN) return d;
            }
            return -1;
        };

        return {
            /**
             * Enter inside a dual_dialogue_column.
             *
             * IMPORTANT: columnDepth is resolved first. Whenever the cursor is inside
             * a column we ALWAYS return true to prevent ProseMirror's default split from
             * creating a rogue dual_dialogue node.
             *
             * Cursor at end of LAST node in column
             *   → exit: insert empty action node right after the dual_dialogue.
             *      If the last node is an empty dialogue, delete it first (cleanup).
             *      Cursor lands at the new action.
             *
             * Cursor in MIDDLE of any node (not at end)
             *   → eject: content after cursor (as a new node of the same type) +
             *      all following siblings in this column → inserted right after the
             *      dual_dialogue. The current node is truncated at the cursor.
             *
             * Cursor at END of a non-last node
             *   → insert an empty dialogue node right after the current node in the column.
             */
            Enter: ({ editor }) => {
                const { state } = editor;
                const { $from, empty: selEmpty } = state.selection;

                // Resolve column depth FIRST so we can always return true when inside
                // a column, regardless of selection state.
                const columnDepth = findColumnDepth($from);
                if (columnDepth === -1) return false;

                // Non-collapsed selection inside column: consume but do nothing.
                if (!selEmpty) return true;

                const innerDepth   = columnDepth + 1;
                const innerNode    = $from.node(innerDepth);
                const columnNode   = $from.node(columnDepth);
                const ddDepth      = columnDepth - 1;
                const ddEnd        = $from.after(ddDepth); // absolute position just after dual_dialogue
                const innerNodeEnd = $from.end(innerDepth);
                const atEnd        = $from.pos === innerNodeEnd;
                const isLastChild  = $from.index(columnDepth) === columnNode.childCount - 1;

                /* ─────────────────────────────────────────────────────────────────────
                 * Case 1 — cursor at end of last node → exit dual_dialogue via action
                 * ───────────────────────────────────────────────────────────────────── */
                if (atEnd && isLastChild) {
                    const actionType = state.schema.nodes[ScreenplayElement.Action];
                    if (!actionType) return true;
                    const newAction = actionType.create({ "data-id": generateNodeId() });
                    const { tr } = state;

                    if (innerNode.content.size === 0) {
                        // Empty last node: delete it first, then insert action.
                        // Delete-then-insert order keeps position arithmetic simple.
                        const nodeFrom = $from.before(innerDepth);
                        const nodeTo   = $from.after(innerDepth);
                        tr.delete(nodeFrom, nodeTo);
                        // ddEnd shifted left by the deleted node size.
                        const newDdEnd = ddEnd - (nodeTo - nodeFrom);
                        tr.insert(newDdEnd, newAction);
                        tr.setSelection(TextSelection.create(tr.doc, newDdEnd + 1));
                    } else {
                        // Non-empty last node at its end: just append action.
                        tr.insert(ddEnd, newAction);
                        // In tr.doc the action occupies [ddEnd, ddEnd+actionSize).
                        tr.setSelection(TextSelection.create(tr.doc, ddEnd + 1));
                    }

                    editor.view.dispatch(tr);
                    return true;
                }

                /* ─────────────────────────────────────────────────────────────────────
                 * Case 2 — cursor in middle of a node → eject tail + following siblings
                 * ───────────────────────────────────────────────────────────────────── */
                if (!atEnd) {
                    const nodeIdx = $from.index(columnDepth);

                    // Build the ejected node list.
                    const ejected: PMNode[] = [];

                    // Tail of the current node (content from cursor to node end).
                    const contentAfter = innerNode.content.cut($from.parentOffset);
                    if (contentAfter.size > 0) {
                        ejected.push(
                            innerNode.type.create(
                                { ...innerNode.attrs, "data-id": generateNodeId() },
                                contentAfter,
                            ),
                        );
                    }

                    // All following siblings in this column.
                    for (let i = nodeIdx + 1; i < columnNode.childCount; i++) {
                        ejected.push(columnNode.child(i));
                    }

                    // Delete everything from cursor to the end of the column content.
                    const deleteFrom = $from.pos;
                    const deleteTo   = $from.end(columnDepth);
                    const deleteSize = deleteTo - deleteFrom;

                    const { tr } = state;
                    tr.delete(deleteFrom, deleteTo);
                    // ddEnd shifted left by the amount deleted.
                    const newDdEnd = ddEnd - deleteSize;
                    if (ejected.length > 0) {
                        tr.insert(newDdEnd, ejected);
                        tr.setSelection(TextSelection.create(tr.doc, newDdEnd + 1));
                    }
                    editor.view.dispatch(tr);
                    return true;
                }

                /* ─────────────────────────────────────────────────────────────────────
                 * Case 3 — cursor at end of a non-last node → insert empty dialogue
                 * ───────────────────────────────────────────────────────────────────── */
                const dialogueType = state.schema.nodes[ScreenplayElement.Dialogue];
                if (!dialogueType) return true;
                const insertPos  = $from.after(innerDepth); // right after current node
                const newDialogue = dialogueType.create({ "data-id": generateNodeId() });
                const { tr } = state;
                tr.insert(insertPos, newDialogue);
                // In tr.doc the new dialogue occupies [insertPos, insertPos+2).
                tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
                editor.view.dispatch(tr);
                return true;
            },

            /**
             * Backspace at the very start of a node inside a dual_dialogue_column:
             *
             * First child of column → always no-op (preserve column structure).
             * Non-first, empty node → delete it, cursor to end of previous sibling.
             * Non-first, non-empty  → move cursor to end of previous sibling (no merge).
             */
            Backspace: ({ editor }) => {
                const { state } = editor;
                const { $from, empty: selEmpty } = state.selection;
                if (!selEmpty) return false;

                const columnDepth = findColumnDepth($from);
                if (columnDepth === -1) return false;

                const innerDepth     = columnDepth + 1;
                const innerNodeStart = $from.start(innerDepth);

                // Only intercept when cursor is at the very start of a child node.
                if ($from.pos !== innerNodeStart) return false;

                const nodeIdx = $from.index(columnDepth);

                // First child of column: no-op to preserve structure.
                if (nodeIdx === 0) return true;

                const innerNode  = $from.node(innerDepth);
                const columnNode = $from.node(columnDepth);

                // Position at end of previous sibling's content.
                const prevChild     = columnNode.child(nodeIdx - 1);
                const prevNodeStart = $from.before(innerDepth) - prevChild.nodeSize;
                const cursorTarget  = prevNodeStart + 1 + prevChild.content.size; // +1 for opening tag

                if (innerNode.content.size === 0) {
                    // Empty node: delete it and place cursor at end of previous sibling.
                    const nodeFrom = $from.before(innerDepth);
                    const nodeTo   = $from.after(innerDepth);
                    const { tr } = state;
                    tr.delete(nodeFrom, nodeTo);
                    tr.setSelection(TextSelection.create(tr.doc, cursorTarget));
                    editor.view.dispatch(tr);
                } else {
                    // Non-empty node: just move cursor to end of previous sibling.
                    const { tr } = state;
                    tr.setSelection(TextSelection.create(tr.doc, cursorTarget));
                    editor.view.dispatch(tr);
                }

                return true;
            },
        };
    },
});
