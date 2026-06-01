import { Editor, Extension } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import type { PersistentScene } from "../scenes";
import { computeSceneLabels, SceneNumberingStyle } from "../scene-locking";
import { ScreenplayElement } from "../../utils/enums";

const sceneLockingPluginKey = new PluginKey("sceneLocking");
const REFRESH_META = "sceneLockingRefresh";

type SceneLockingConfig = {
    getSceneLocking: () => boolean;
    getScenes: () => Record<string, PersistentScene>;
    getNumberingStyle: () => SceneNumberingStyle;
    getSkippedLetters: () => readonly string[];
};

type SceneEntry = { uuid: string; pos: number; nodeSize: number };

const collectSceneEntries = (doc: Node): SceneEntry[] => {
    const out: SceneEntry[] = [];
    doc.forEach((node, pos) => {
        if (node.attrs?.class !== ScreenplayElement.Scene) return;
        const uuid: string | undefined = node.attrs?.["data-id"];
        if (!uuid) return;
        out.push({ uuid, pos, nodeSize: node.nodeSize });
    });
    return out;
};

/**
 * Does any step in this transaction touch a Scene node or any node that sits
 * between Scene boundaries? Used as a cheap early-exit so we don't rebuild
 * decorations on every keystroke inside an action paragraph far away from
 * any omitted scene. We have to be conservative when omitted scenes exist
 * because hiding the body of an omitted scene means body-paragraph edits
 * must trigger decoration recomputation too.
 */
const didSceneNodesChange = (tr: Transaction): boolean => {
    if (!tr.docChanged) return false;
    for (const step of tr.steps) {
        const stepMap = step.getMap();
        let affected = false;
        stepMap.forEach((oldStart: number, oldEnd: number, newStart: number, newEnd: number) => {
            try {
                const oldDoc = tr.docs[0];
                if (oldDoc) {
                    oldDoc.nodesBetween(oldStart, oldEnd, (node: Node) => {
                        if (node.attrs?.class === ScreenplayElement.Scene) affected = true;
                    });
                }
            } catch { /* range out of bounds */ }
            try {
                tr.doc.nodesBetween(newStart, newEnd, (node: Node) => {
                    if (node.attrs?.class === ScreenplayElement.Scene) affected = true;
                });
            } catch { /* range out of bounds */ }
        });
        if (affected) return true;
    }
    return false;
};

const buildLabelWidget = (label: string, side: "left" | "right"): HTMLElement => {
    const span = document.createElement("span");
    span.className = side === "left" ? "scene-label scene-label-left" : "scene-label scene-label-right";
    span.contentEditable = "false";
    span.textContent = label;
    return span;
};

const hasAnyOmitted = (scenes: Record<string, PersistentScene>): boolean => {
    for (const key in scenes) {
        if (scenes[key]?.omitted) return true;
    }
    return false;
};

const computeDecorations = (
    doc: Node,
    locking: boolean,
    scenes: Record<string, PersistentScene>,
    style: SceneNumberingStyle,
    skippedLetters: readonly string[],
): DecorationSet => {
    // Nothing to render: no production lock and no omitted scenes. Skip the
    // doc traversal entirely — this is the common case for most users.
    if (!locking && !hasAnyOmitted(scenes)) return DecorationSet.empty;

    const entries = collectSceneEntries(doc);
    if (entries.length === 0) return DecorationSet.empty;

    const decorations: Decoration[] = [];

    // Scene-number labels are only meaningful under production lock.
    if (locking) {
        const labels = computeSceneLabels(
            entries.map((e) => e.uuid),
            scenes,
            style,
            skippedLetters,
        );

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const info = labels[i];
            const keyBase = `${entry.uuid}-${info.label}-${info.status}`;

            decorations.push(
                Decoration.widget(entry.pos + 1, () => buildLabelWidget(info.label, "left"), {
                    side: -1,
                    key: `scene-label-l-${keyBase}`,
                }),
            );
            decorations.push(
                Decoration.widget(entry.pos + 1, () => buildLabelWidget(info.label, "right"), {
                    side: -1,
                    key: `scene-label-r-${keyBase}`,
                }),
            );
        }
    }

    // OMITTED decorations are independent of production lock. The heading
    // text itself is replaced with "OMITTED" inside the document by
    // `omitSceneByUuid` (the original is preserved in scene metadata), so
    // here we only need to grey the heading via `data-scene-omitted` and
    // collapse the body paragraphs via `data-omitted-body`.
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!scenes[entry.uuid]?.omitted) continue;

        decorations.push(
            Decoration.node(entry.pos, entry.pos + entry.nodeSize, {
                "data-scene-omitted": "true",
            }),
        );

        const nextEntry = entries[i + 1];
        const bodyEnd = nextEntry ? nextEntry.pos : doc.content.size;
        const bodyStart = entry.pos + entry.nodeSize;
        doc.forEach((node, pos) => {
            if (pos >= bodyStart && pos < bodyEnd) {
                decorations.push(
                    Decoration.node(pos, pos + node.nodeSize, {
                        "data-omitted-body": "true",
                    }),
                );
            }
        });
    }

    return DecorationSet.create(doc, decorations);
};

/**
 * Tiptap extension that renders scene-number labels under production lock
 * and OMITTED overlays (independent of lock state).
 *
 * Hot-path notes:
 *  - `apply` runs on every transaction. We early-exit when no scene nodes
 *    were touched, simply mapping existing decorations forward through the
 *    transaction. Full recomputation only happens on an explicit refresh
 *    signal or when a scene node was actually modified.
 */
export const createSceneLockingExtension = (config: SceneLockingConfig) => {
    return Extension.create({
        name: "sceneLocking",

        addProseMirrorPlugins() {
            const { getSceneLocking, getScenes, getNumberingStyle, getSkippedLetters } = config;

            return [
                new Plugin({
                    key: sceneLockingPluginKey,
                    state: {
                        init(_, { doc }) {
                            return computeDecorations(
                                doc,
                                getSceneLocking(),
                                getScenes(),
                                getNumberingStyle(),
                                getSkippedLetters(),
                            );
                        },
                        apply(tr, oldDecorations, _oldState, newState) {
                            // Explicit refresh (lock toggle, lock-map change) → recompute.
                            if (tr.getMeta(REFRESH_META)) {
                                return computeDecorations(
                                    newState.doc,
                                    getSceneLocking(),
                                    getScenes(),
                                    getNumberingStyle(),
                                    getSkippedLetters(),
                                );
                            }

                            if (!tr.docChanged) return oldDecorations;

                            // Doc edits that don't touch a scene node only shift
                            // existing decorations — no need to rebuild widgets.
                            if (!didSceneNodesChange(tr)) {
                                return oldDecorations.map(tr.mapping, newState.doc);
                            }

                            return computeDecorations(
                                newState.doc,
                                getSceneLocking(),
                                getScenes(),
                                getNumberingStyle(),
                                getSkippedLetters(),
                            );
                        },
                    },
                    props: {
                        decorations(state) {
                            return this.getState(state);
                        },
                    },
                }),
            ];
        },
    });
};

/**
 * Force a recompute of scene label decorations.
 * Call when sceneLocking toggles or the sceneLocks map changes.
 */
export const refreshSceneLocking = (editor: Editor | null) => {
    if (!editor || !editor.view) return;
    editor.view.dispatch(editor.state.tr.setMeta(REFRESH_META, true));
};
