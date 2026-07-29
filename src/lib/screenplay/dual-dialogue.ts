import { Editor } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ScreenplayElement } from "../utils/enums";
import { DUAL_DIALOGUE_COLUMN } from "./nodes/dual-dialogue-column-node";

/**
 * Collect a dialogue "block" starting at doc child index `startIndex`.
 * A block is: character, zero or more parentheticals, one dialogue.
 * Returns the nodes and the index after the last consumed node, or null if the
 * pattern doesn't match.
 */
const collectBlock = (
    doc: ProseMirrorNode,
    startIndex: number,
): { nodes: ProseMirrorNode[]; nextIndex: number } | null => {
    const count = doc.childCount;
    let i = startIndex;

    if (i >= count) return null;
    const first = doc.child(i);
    if (first.attrs.class !== ScreenplayElement.Character) return null;

    const nodes: ProseMirrorNode[] = [first];
    i++;

    // Consume optional leading parentheticals
    while (i < count && doc.child(i).attrs.class === ScreenplayElement.Parenthetical) {
        nodes.push(doc.child(i));
        i++;
    }

    // Require at least one dialogue
    if (i >= count || doc.child(i).attrs.class !== ScreenplayElement.Dialogue) return null;
    nodes.push(doc.child(i));
    i++;

    // Consume any additional parenthetical/dialogue pairs
    while (i < count) {
        const cls = doc.child(i).attrs.class;
        if (cls === ScreenplayElement.Parenthetical || cls === ScreenplayElement.Dialogue) {
            nodes.push(doc.child(i));
            i++;
        } else {
            break;
        }
    }

    return { nodes, nextIndex: i };
};

/**
 * Whether `makeDualDialogue` would find its pattern at `pos` — i.e. the block at
 * that position is a character→dialogue block immediately followed by another
 * one. Shares `collectBlock` with the transform, so the affordance offering the
 * action can never disagree with what the action actually does.
 */
export const canMakeDualDialogue = (editor: Editor, pos: number): boolean => {
    const { doc } = editor.state;
    if (doc.content.size === 0) return false;

    const $pos = doc.resolve(Math.min(pos, doc.content.size - 1));
    const left = collectBlock(doc, $pos.index(0));
    if (!left) return false;

    return collectBlock(doc, left.nextIndex) !== null;
};

/**
 * Convert two sequential character→dialogue blocks into a dual-dialogue node.
 * The `pos` argument is any document position inside (or at the start of) the
 * first character node of the pair.
 *
 * Fails silently (no dispatch) if the pattern is not found.
 */
export const makeDualDialogue = (editor: Editor, pos: number): void => {
    const { state } = editor;
    const { doc, schema } = state;
    const tr = state.tr;

    // Resolve to the top-level (depth-1) node containing pos
    const $pos = doc.resolve(Math.min(pos, doc.content.size - 1));
    // Walk up to depth 1 (direct child of doc)
    const depth = $pos.depth > 0 ? 1 : 0;
    const startIndex = $pos.index(depth === 1 ? 0 : 0);

    // Collect left block
    const left = collectBlock(doc, startIndex);
    if (!left) return;

    // Collect right block immediately after left
    const right = collectBlock(doc, left.nextIndex);
    if (!right) return;

    // Compute from/to positions in the doc
    let fromPos = 0;
    for (let i = 0; i < startIndex; i++) fromPos += doc.child(i).nodeSize;
    let toPos = fromPos;
    for (const n of [...left.nodes, ...right.nodes]) toPos += n.nodeSize;

    const columnType = schema.nodes[DUAL_DIALOGUE_COLUMN];
    const dualType = schema.nodes[ScreenplayElement.DualDialogue];
    if (!columnType || !dualType) return;

    const leftColumn = columnType.create(null, left.nodes);
    const rightColumn = columnType.create(null, right.nodes);
    const dualNode = dualType.create(null, [leftColumn, rightColumn]);

    tr.replaceWith(fromPos, toPos, dualNode);
    editor.view.dispatch(tr);
};
