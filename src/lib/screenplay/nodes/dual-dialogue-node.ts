import { Node, mergeAttributes } from "@tiptap/core";
import { ScreenplayElement } from "../../utils/enums";
import { generateNodeId } from "./index";
import { DUAL_DIALOGUE_COLUMN } from "./dual-dialogue-column-node";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Node as PMNode } from "@tiptap/pm/model";

export interface DualDialogueNodeOptions {
    HTMLAttributes: Record<string, unknown>;
}

/**
 * Container node for simultaneous (dual) dialogue.
 * Holds exactly two dual-dialogue-column children, rendered side by side via CSS flexbox.
 * Treated as a single indivisible pagination unit — never split across pages.
 */
export const DualDialogueNode = Node.create<DualDialogueNodeOptions>({
    name: ScreenplayElement.DualDialogue,
    group: "block",
    content: `${DUAL_DIALOGUE_COLUMN} ${DUAL_DIALOGUE_COLUMN}`,
    defining: true,
    draggable: false,

    addOptions() {
        return { HTMLAttributes: {} };
    },

    addAttributes() {
        return {
            "data-id": {
                default: () => generateNodeId(),
                parseHTML: (element) => element.getAttribute("data-id") || null,
                renderHTML: (attributes) => attributes["data-id"] ? { "data-id": attributes["data-id"] } : {},
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
                tag: "div",
                getAttrs: (element) => {
                    const el = element as HTMLElement;
                    return el.classList.contains(ScreenplayElement.DualDialogue) ? {} : false;
                },
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["div", mergeAttributes(this.options.HTMLAttributes, { class: ScreenplayElement.DualDialogue }, HTMLAttributes), 0];
    },

    addProseMirrorPlugins() {
        const pluginKey = new PluginKey("dual-dialogue-cleanup");

        const VALID_COLUMN_TYPES = new Set<string>([
            ScreenplayElement.Character,
            ScreenplayElement.Dialogue,
            ScreenplayElement.Parenthetical,
        ]);

        /**
         * Split a column's children into those that belong (valid) and those that
         * should be ejected (first invalid type and everything after it).
         */
        const processColumn = (col: PMNode): { valid: PMNode[]; ejected: PMNode[] } => {
            const valid: PMNode[] = [];
            const ejected: PMNode[] = [];
            let ejecting = false;
            col.forEach((child) => {
                if (!ejecting && !VALID_COLUMN_TYPES.has(child.type.name)) ejecting = true;
                if (ejecting) ejected.push(child);
                else valid.push(child);
            });
            return { valid, ejected };
        };

        const textOf = (nodes: PMNode[]) => nodes.reduce((s, n) => s + n.textContent, "");

        return [
            new Plugin({
                key: pluginKey,
                appendTransaction(transactions, _oldState, newState) {
                    // Only run after doc-changing transactions that aren't our own cleanup.
                    if (!transactions.some((tr) => tr.docChanged)) return null;
                    if (transactions.some((tr) => tr.getMeta(pluginKey))) return null;

                    const { doc, schema, tr } = newState;
                    const actionType = schema.nodes[ScreenplayElement.Action];
                    const colType = schema.nodes[DUAL_DIALOGUE_COLUMN];
                    if (!actionType || !colType) return null;

                    // Collect whole-node replacements back-to-front.
                    const replacements: { from: number; to: number; nodes: PMNode[] }[] = [];

                    doc.forEach((node, offset) => {
                        if (node.type.name !== ScreenplayElement.DualDialogue) return;
                        if (node.childCount !== 2) return;

                        const leftResult = processColumn(node.child(0));
                        const rightResult = processColumn(node.child(1));

                        const leftValid = leftResult.valid;
                        const rightValid = rightResult.valid;
                        const allEjected = [...leftResult.ejected, ...rightResult.ejected];

                        const leftTextEmpty = textOf(leftValid) === "";
                        const rightTextEmpty = textOf(rightValid) === "";

                        // No changes needed if both columns are valid and non-empty.
                        if (
                            leftResult.ejected.length === 0 &&
                            rightResult.ejected.length === 0 &&
                            !leftTextEmpty &&
                            !rightTextEmpty
                        ) return;

                        const ddFrom = offset;
                        const ddTo = offset + node.nodeSize;
                        let replacementNodes: PMNode[];

                        if (leftTextEmpty && rightTextEmpty) {
                            // Both effectively empty → empty action + any ejected nodes.
                            replacementNodes = [
                                actionType.create({ "data-id": generateNodeId() }),
                                ...allEjected,
                            ];
                        } else if (leftTextEmpty) {
                            // Left gone → flatten right valid children + ejected.
                            replacementNodes = [...rightValid, ...allEjected];
                        } else if (rightTextEmpty) {
                            // Right gone → flatten left valid children + ejected.
                            replacementNodes = [...leftValid, ...allEjected];
                        } else {
                            // Both columns still have content; rebuild dual_dialogue with
                            // trimmed columns and append ejected nodes after.
                            const newLeftCol = colType.create(null, leftValid);
                            const newRightCol = colType.create(null, rightValid);
                            const newDd = node.type.create(node.attrs, [newLeftCol, newRightCol]);
                            replacementNodes = [newDd, ...allEjected];
                        }

                        replacements.push({ from: ddFrom, to: ddTo, nodes: replacementNodes });
                    });

                    if (replacements.length === 0) return null;

                    // Apply back-to-front so earlier positions stay valid.
                    replacements.sort((a, b) => b.from - a.from);
                    for (const { from, to, nodes } of replacements) {
                        tr.replaceWith(from, to, nodes);
                    }
                    tr.setMeta(pluginKey, true);
                    return tr;
                },
            }),
        ];
    },
});
