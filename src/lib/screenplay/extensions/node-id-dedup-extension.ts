import { Extension } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
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

                        /** Position of the node currently holding each data-id. A bare
                         *  number, not the node: the duplicate-free pass is the one that
                         *  runs on every Enter, and it must not allocate per line. */
                        const seen = new Map<string, number>();
                        /** Ids whose holder is an EMPTY node — the only case in which the
                         *  earlier node has to be looked up again (see below). Screenplay
                         *  lines mostly carry text, so this stays small. */
                        const emptyHolders = new Set<string>();

                        /** Give the node at `pos` a fresh id, so the other keeps `dataId`. */
                        const reid = (pos: number, node: PMNode, dataId: string) => {
                            const newId = generateNodeId();
                            tr.setNodeMarkup(pos, undefined, { ...node.attrs, "data-id": newId });
                            modified = true;

                            if (hasPaste && node.type.name === ScreenplayElement.Scene) {
                                config.duplicatePersistentScene(dataId, newId);
                            }
                        };

                        newState.doc.forEach((node, pos) => {
                            const dataId: string | null = node.attrs["data-id"] ?? null;
                            if (dataId === null) return;

                            const firstPos = seen.get(dataId);
                            if (firstPos === undefined) {
                                seen.set(dataId, pos);
                                if (node.content.size === 0) emptyHolders.add(dataId);
                                return;
                            }

                            // Which of the two is the new node? An Enter that splits a
                            // line copies the whole attribute set onto both halves, so
                            // the id cannot say — but the text can: a line's identity
                            // follows its words, so the half the split left EMPTY is the
                            // new one. That is the rule scene headings already apply for
                            // themselves (see scene-node's Enter handler); this extends
                            // it to every element type.
                            //
                            // It matters beyond tidiness, because everything keyed on
                            // data-id follows the id rather than the text. Pressing Enter
                            // at the START of a line — inserting a blank line above it —
                            // leaves the blank half holding the id, so the revision
                            // baseline reads the line below as one it has never seen and
                            // colours the whole of it, though not a word of it changed.
                            //
                            // Copies carry the same content on both sides, so a paste or
                            // drop never reaches the asymmetry and its later node is
                            // re-identified exactly as before.
                            //
                            // The earlier node is fetched only on the split-at-start
                            // branch, which needs its attributes to rewrite them. `nodeAt`
                            // is a linear scan of the top level, and a paste can bring
                            // hundreds of duplicates through here at once — but a copy is
                            // never the empty half of a split, so the emptiness test
                            // (already answered, no lookup needed) keeps every one of them
                            // on the branch below, where the node is in hand already.
                            if (node.content.size > 0 && emptyHolders.has(dataId)) {
                                const first = newState.doc.nodeAt(firstPos);
                                if (first) {
                                    seen.set(dataId, pos);
                                    emptyHolders.delete(dataId);
                                    reid(firstPos, first, dataId);
                                    return;
                                }
                            }
                            reid(pos, node, dataId);
                        });

                        return modified ? tr.setMeta("nodeDedupId", true) : null;
                    },
                }),
            ];
        },
    });
};
