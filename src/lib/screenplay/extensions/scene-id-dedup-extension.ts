import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ScreenplayElement } from "../../utils/enums";
import { generateSceneId } from "../scenes";

const sceneIdDedupPluginKey = new PluginKey("sceneIdDedup");

type SceneIdDedupConfig = {
    duplicatePersistentScene: (originalId: string, newId: string) => void;
};

/**
 * Ensures scene-id uniqueness after paste and Enter split operations.
 *
 * Paste: When a persistent scene heading is copy-pasted, the pasted node
 * retains the same scene-id. This plugin detects duplicates and assigns
 * fresh IDs to the copies, also duplicating the persistent scene data.
 * Cut+paste is handled correctly: no duplicate exists, so no reassignment.
 *
 * Split: TipTap's splitBlock only respects keepOnSplit when splitting at the
 * end of a node. When splitting mid-text, ProseMirror's ReplaceStep copies
 * all attributes. This plugin detects consecutive scene nodes sharing the
 * same scene-id and clears the id on the split-off node.
 */
export const createSceneIdDedupExtension = (config: SceneIdDedupConfig) => {
    return Extension.create({
        name: "sceneIdDedup",

        addProseMirrorPlugins() {
            return [
                new Plugin({
                    key: sceneIdDedupPluginKey,

                    appendTransaction(transactions, _oldState, newState) {
                        const docChanged = transactions.some((tr) => tr.docChanged);
                        if (!docChanged) return null;

                        const hasPaste = transactions.some((tr) => tr.getMeta("uiEvent") === "paste");

                        let tr = newState.tr;
                        let modified = false;

                        // --- Handle split: strip scene-id from split-off nodes ---
                        // When a scene node is split (Enter key), ProseMirror copies all
                        // attributes to both halves. Detect consecutive scene nodes
                        // sharing the same scene-id and clear it on the second one.
                        let prevSceneId: string | null = null;
                        newState.doc.forEach((node, pos) => {
                            if (node.type.name !== ScreenplayElement.Scene) {
                                prevSceneId = null;
                                return;
                            }
                            const id = node.attrs["scene-id"];
                            if (id && id === prevSceneId) {
                                // Consecutive scene with same id → split-off, clear it
                                tr.setNodeMarkup(pos, undefined, {
                                    ...node.attrs,
                                    "scene-id": null,
                                });
                                modified = true;
                            }
                            prevSceneId = id;
                        });

                        // --- Handle paste: deduplicate scene-ids ---
                        if (hasPaste) {
                            const seenIds = new Map<string, boolean>();
                            const doc = modified ? tr.doc : newState.doc;
                            doc.forEach((node, pos) => {
                                if (node.type.name !== ScreenplayElement.Scene) return;
                                const id = node.attrs["scene-id"];
                                if (!id) return;

                                if (seenIds.has(id)) {
                                    // Duplicate — assign a new id and copy persistent data
                                    const newId = generateSceneId();
                                    tr.setNodeMarkup(pos, undefined, {
                                        ...node.attrs,
                                        "scene-id": newId,
                                    });
                                    config.duplicatePersistentScene(id, newId);
                                    modified = true;
                                } else {
                                    seenIds.set(id, true);
                                }
                            });
                        }

                        return modified ? tr : null;
                    },
                }),
            ];
        },
    });
};
