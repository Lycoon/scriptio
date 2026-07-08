import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { ReplaceAroundStep, ReplaceStep } from "@tiptap/pm/transform";
import { generateNodeId } from "@src/lib/screenplay/nodes";
import { ScreenplayElement } from "../../utils/enums";

const nodeIdDedupPluginKey = new PluginKey("nodeIdDedup");

type NodeIdDedupConfig = {
    duplicatePersistentScene: (originalId: string, newId: string) => void;
};

/**
 * Ensures data-id uniqueness across the document.
 *
 * IDs are assigned at node creation time via each node's addAttributes default factory.
 * This plugin only handles the duplicate case: when a node is copy-pasted, both the
 * original and copy share the same data-id. A new ID is generated for the copy, and
 * for persistent scene headings, the persistent scene data is duplicated as well.
 *
 * NOTE: production sceneLocks are intentionally NOT duplicated here — a pasted scene
 * should start unlocked/provisional, not inherit the source's frozen label.
 */
/**
 * Can this transaction have introduced a duplicate data-id? Only steps that
 * insert BLOCK content can: paste/drop (copied blocks share the source's ids),
 * Enter splits (ProseMirror copies attrs onto both halves), and node-wrapper
 * replacements (setNodeMarkup). Plain text edits — the typing hot path —
 * insert inline content only and can never duplicate an id, so the O(doc)
 * dedup scan below is skipped for them. Unknown step types count as "maybe"
 * to stay conservative.
 */
const mayIntroduceDuplicateIds = (tr: Transaction): boolean => {
    for (const step of tr.steps) {
        if (!(step instanceof ReplaceStep) && !(step instanceof ReplaceAroundStep)) return true;
        const content = step.slice.content;
        for (let i = 0; i < content.childCount; i++) {
            if (content.child(i).isBlock) return true;
        }
    }
    return false;
};

export const createNodeIdDedupExtension = (config: NodeIdDedupConfig) => {
    return Extension.create({
        name: "nodeIdDedup",

        addProseMirrorPlugins() {
            return [
                new Plugin({
                    key: nodeIdDedupPluginKey,

                    appendTransaction(transactions, _oldState, newState) {
                        const docChanged = transactions.some((tr) => tr.docChanged);
                        if (!docChanged) return null;

                        const hasPaste = transactions.some((tr) => tr.getMeta("uiEvent") === "paste");
                        if (!hasPaste && !transactions.some(mayIntroduceDuplicateIds)) return null;

                        const tr = newState.tr;
                        let modified = false;

                        const seenDataIds = new Set<string>();

                        newState.doc.forEach((node, pos) => {
                            const dataId: string | null = node.attrs["data-id"] ?? null;
                            if (dataId === null) return;

                            if (seenDataIds.has(dataId)) {
                                const newId = generateNodeId();
                                tr.setNodeMarkup(pos, undefined, { ...node.attrs, "data-id": newId });
                                modified = true;

                                if (hasPaste && node.type.name === ScreenplayElement.Scene) {
                                    config.duplicatePersistentScene(dataId, newId);
                                }
                            } else {
                                seenDataIds.add(dataId);
                            }
                        });

                        return modified ? tr.setMeta("nodeDedupId", true) : null;
                    },
                }),
            ];
        },
    });
};
