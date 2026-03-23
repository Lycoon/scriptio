import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { v4 as uuidv4 } from "uuid";
import { ScreenplayElement } from "../../utils/enums";

const nodeIdDedupPluginKey = new PluginKey("nodeIdDedup");

type NodeIdDedupConfig = {
    duplicatePersistentScene: (originalId: string, newId: string) => void;
};

/**
 * Ensures data-id uniqueness across the document.
 *
 * Data ID: Every node receives a unique data-id. If a node lacks one, or shares
 * it with another node (due to paste or split), a new UUID is generated.
 *
 * Persistent Scene Data (Paste): When a persistent scene heading is copy-pasted, the pasted node
 * gets a new data-id. This plugin detects the duplicate and assigns a
 * fresh ID to the copy, also duplicating the persistent scene data.
 */
export const createNodeIdDedupExtension = (config: NodeIdDedupConfig) => {
    return Extension.create({
        name: "nodeIdDedup",

        addGlobalAttributes() {
            return [
                {
                    types: Object.values(ScreenplayElement),
                    attributes: {
                        "data-id": {
                            default: null,
                            parseHTML: (element) => element.getAttribute("data-id") || element.getAttribute("scene-id") || element.getAttribute("data-scene-id") || null,
                            renderHTML: (attributes) => {
                                if (!attributes["data-id"]) {
                                    return {};
                                }
                                return { "data-id": attributes["data-id"] };
                            },
                        },
                    },
                },
            ];
        },

        addProseMirrorPlugins() {
            return [
                new Plugin({
                    key: nodeIdDedupPluginKey,

                    appendTransaction(transactions, _oldState, newState) {
                        const docChanged = transactions.some((tr) => tr.docChanged);
                        if (!docChanged) return null;

                        const hasPaste = transactions.some((tr) => tr.getMeta("uiEvent") === "paste");

                        let tr = newState.tr;
                        let modified = false;

                        const seenDataIds = new Set<string>();

                        newState.doc.forEach((node, pos) => {
                            if (node.attrs["data-id"] === undefined) {
                                return;
                            }

                            let newAttrs = { ...node.attrs };
                            let nodeModified = false;

                            const dataId = newAttrs["data-id"];
                            if (!dataId || seenDataIds.has(dataId)) {
                                const newId = uuidv4();
                                newAttrs["data-id"] = newId;
                                nodeModified = true;

                                if (hasPaste && node.type.name === ScreenplayElement.Scene && dataId) {
                                    config.duplicatePersistentScene(dataId, newId);
                                }
                            }
                            seenDataIds.add(newAttrs["data-id"]);

                            if (nodeModified) {
                                tr.setNodeMarkup(pos, undefined, newAttrs);
                                modified = true;
                            }
                        });

                        return modified ? tr : null;
                    },
                }),
            ];
        },
    });
};
