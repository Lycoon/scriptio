import { Editor, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { SpellWorkerRequest, SpellWorkerResponse } from "./spellcheck-types";
import { ScreenplayElement } from "../utils/enums";

const spellcheckPluginKey = new PluginKey<SpellPluginState>("spellcheck");

/** Unicode-aware word tokenizer */
const WORD_RE = /[\p{L}\p{M}''\u2019-]+/gu;
/** Filters out pure-punctuation matches like "-" or "--" that have no letter content */
const HAS_LETTER_RE = /\p{L}/u;

/** Debounce delay before sending words to the worker */
const CHECK_DEBOUNCE_MS = 300;

/** Node types that receive spellchecking (all except character) */
const SPELLCHECKED_TYPES = new Set<string>([
    ScreenplayElement.Scene,
    ScreenplayElement.Action,
    ScreenplayElement.Dialogue,
    ScreenplayElement.Parenthetical,
    ScreenplayElement.Transition,
    ScreenplayElement.Section,
    ScreenplayElement.Note,
]);

type SpellcheckConfig = {
    getWorker: () => Worker | null;
    getEnabled: () => boolean;
    getCharacters: () => Record<string, unknown> | undefined;
};

/** A word extracted from a node, with its relative offset within the node's content. */
type RelativeWord = { word: string; relFrom: number; relTo: number };

/** A misspelled word at a relative offset within a node's content. */
type RelativeError = { relFrom: number; relTo: number; word: string };

/** One node's contribution to a pending spellcheck request. */
type PendingNode = { nodeId: string; words: RelativeWord[]; text: string };

type SpellPluginState = {
    /** nodeId → full text string of the last time this node was checked. Acts as a cache invalidator. */
    checkedNodes: Map<string, string>;
    /** nodeId → array of relative errors. The global lightweight cache. */
    nodeErrors: Map<string, RelativeError[]>;
    /** Built from current doc positions. Remapped continuously, and completely rebuilt on scroll to strictly window the viewport. */
    decorations: DecorationSet;
};

/** Shared attrs object — ProseMirror uses reference equality first in attrsEq. */
const SPELL_ATTRS = { class: "spellcheck-error", nodeName: "span" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract words from a single node with positions **relative** to the node's
 * content start (i.e. relative to `nodePos + 1` in the document).
 * Also returns the combined text of the node to act as a cache key.
 */
function extractNodeWords(node: any): { words: RelativeWord[]; text: string } {
    const words: RelativeWord[] = [];
    let combined = "";

    node.forEach((child: any) => {
        if (child.isText) {
            combined += child.text;
        } else {
            // Ensure our string length matches the ProseMirror node size exactly.
            // This guarantees match.index maps 1:1 to the relative node offset
            // without requiring heavy array allocations per character.
            combined += "\n".repeat(child.nodeSize);
        }
    });

    WORD_RE.lastIndex = 0;
    let match;
    while ((match = WORD_RE.exec(combined)) !== null) {
        if (!HAS_LETTER_RE.test(match[0])) continue;
        words.push({ word: match[0], relFrom: match.index, relTo: match.index + match[0].length });
    }

    return { words, text: combined };
}

/**
 * Returns a cached character word set, rebuilt only when the characters
 * object reference changes (avoids rebuilding on every keypress).
 */
function makeCharacterWordCache() {
    let lastRef: Record<string, unknown> | undefined = undefined;
    let lastSet = new Set<string>();
    return (characters: Record<string, unknown> | undefined): Set<string> => {
        if (characters === lastRef) return lastSet;
        lastRef = characters;
        const words = new Set<string>();
        for (const name of Object.keys(characters ?? {})) {
            for (const token of name.split(/\s+/)) {
                if (token) words.add(token);
            }
        }
        return (lastSet = words);
    };
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export const createSpellcheckExtension = (config: SpellcheckConfig) => {
    const { getWorker, getEnabled, getCharacters } = config;

    /** word → true (correct) | false (misspelled) */
    const wordCache = new Map<string, boolean>();

    let nextRequestId = 0;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let editorView: any = null;

    /**
     * Pending spellcheck requests: id → nodes included in that request.
     * Nodes are removed from the entry when re-edited, so stale results
     * never overwrite fresh data.
     */
    const pendingRequests = new Map<number, PendingNode[]>();

    /** Nodes accumulated during the current debounce window: nodeId → {words, text} */
    let pendingNodes = new Map<string, { words: RelativeWord[]; text: string }>();

    const getCharacterWords = makeCharacterWordCache();

    function scheduleCheck(nodes: Array<{ nodeId: string; words: RelativeWord[]; text: string }>) {
        for (const { nodeId, words, text } of nodes) {
            pendingNodes.set(nodeId, { words, text });
        }
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(flushCheck, CHECK_DEBOUNCE_MS);
    }

    function flushCheck() {
        const worker = getWorker();
        if (!worker || pendingNodes.size === 0) {
            pendingNodes = new Map();
            return;
        }

        const characterWords = getCharacterWords(getCharacters());
        const seen = new Set<string>();
        const wordsToCheck: string[] = [];
        const requestNodes: PendingNode[] = [];

        for (const [nodeId, { words: nodeWords, text }] of pendingNodes) {
            const filtered = nodeWords.filter((w) => !characterWords.has(w.word.toUpperCase()));

            // We always push the node so we can update its cache, even if it has no misspelled words
            requestNodes.push({ nodeId, words: filtered, text });

            for (const { word } of filtered) {
                if (!seen.has(word)) {
                    seen.add(word);
                    if (wordCache.get(word) === undefined) {
                        wordsToCheck.push(word);
                    }
                }
            }
        }

        pendingNodes = new Map();
        if (!requestNodes.length) return;

        if (wordsToCheck.length === 0) {
            // All words are cached — dispatch immediately using cached misspelled set
            const misspelled = [...seen].filter((w) => wordCache.get(w) === false);
            if (editorView) {
                editorView.dispatch(
                    editorView.state.tr.setMeta("spellcheckResults", { nodes: requestNodes, misspelled }),
                );
            }
            return;
        }

        const id = nextRequestId++;
        pendingRequests.set(id, requestNodes);

        const handler = (e: MessageEvent<SpellWorkerResponse>) => {
            const msg = e.data;
            if (msg.type !== "CHECK_RESULT" || msg.id !== id) return;
            worker.removeEventListener("message", handler);

            // Update cache with new results
            const newMisspelled = new Set(msg.misspelled);
            for (const w of wordsToCheck) wordCache.set(w, !newMisspelled.has(w));

            // Retrieve (possibly pruned) node list and dispatch
            const nodes = pendingRequests.get(id) ?? [];
            pendingRequests.delete(id);

            if (!nodes.length) return;

            // Build the full misspelled set across all words in the request (now all cached)
            const allWords = new Set(nodes.flatMap((n) => n.words.map((w) => w.word)));
            const misspelled = [...allWords].filter((w) => wordCache.get(w) === false);

            if (editorView) {
                editorView.dispatch(editorView.state.tr.setMeta("spellcheckResults", { nodes, misspelled }));
            }
        };

        worker.addEventListener("message", handler);
        worker.postMessage({ type: "CHECK", id, words: wordsToCheck } satisfies SpellWorkerRequest);
    }

    return Extension.create({
        name: "spellcheck",

        addProseMirrorPlugins() {
            return [
                new Plugin({
                    key: spellcheckPluginKey,

                    view(view) {
                        editorView = view;
                        let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

                        const updateViewport = () => {
                            if (!editorView || !editorView.dom) return;

                            try {
                                const rect = editorView.dom.getBoundingClientRect();
                                const vHeight = window.innerHeight || document.documentElement.clientHeight;

                                // If editor is off screen, do nothing
                                if (rect.bottom < 0 || rect.top > vHeight) return;

                                // The visible top and bottom relative to the viewport
                                const visibleTop = Math.max(0, rect.top + 1);
                                const visibleBottom = Math.min(vHeight, rect.bottom - 1);

                                let from = 0;
                                let to = editorView.state.doc.content.size;

                                const startCoord = editorView.posAtCoords({
                                    left: rect.left + rect.width / 2,
                                    top: visibleTop,
                                });
                                if (startCoord) from = startCoord.pos;

                                const endCoord = editorView.posAtCoords({
                                    left: rect.left + rect.width / 2,
                                    top: visibleBottom,
                                });
                                if (endCoord) to = endCoord.pos;

                                if (from > to) {
                                    const temp = from;
                                    from = to;
                                    to = temp;
                                }

                                // Add a generous character buffer (e.g., ~5000 characters for smooth scrolling)
                                const CHAR_BUFFER = 5000;
                                from = Math.max(0, from - CHAR_BUFFER);
                                to = Math.min(editorView.state.doc.content.size, to + CHAR_BUFFER);

                                editorView.dispatch(
                                    editorView.state.tr
                                        .setMeta("spellcheckViewport", { from, to })
                                        .setMeta("addToHistory", false),
                                );
                            } catch (err) {
                                // posAtCoords might fail if outside coordinates
                            }
                        };

                        const onScroll = () => {
                            if (scrollTimeout) clearTimeout(scrollTimeout);
                            scrollTimeout = setTimeout(updateViewport, 100);
                        };

                        // Use capture phase to catch scrolls from any internal containers
                        window.addEventListener("scroll", onScroll, true);
                        window.addEventListener("resize", onScroll, true);

                        // Initial viewport calculation
                        setTimeout(updateViewport, 100);

                        return {
                            destroy() {
                                window.removeEventListener("scroll", onScroll, true);
                                window.removeEventListener("resize", onScroll, true);
                                if (scrollTimeout) clearTimeout(scrollTimeout);
                                editorView = null;
                                if (debounceTimer) clearTimeout(debounceTimer);
                            },
                        };
                    },

                    state: {
                        init(_, { doc }): SpellPluginState {
                            if (getEnabled()) {
                                const nodesToCheck: Array<{ nodeId: string; words: RelativeWord[]; text: string }> = [];
                                doc.descendants((node: any) => {
                                    if (node.isTextblock) {
                                        const nodeId = node.attrs?.["data-id"];
                                        if (nodeId && SPELLCHECKED_TYPES.has(node.type.name)) {
                                            const { words, text } = extractNodeWords(node);
                                            nodesToCheck.push({ nodeId, words, text });
                                        }
                                        return false; // skip text children
                                    }
                                    return true; // continue descending into structural nodes
                                });
                                if (nodesToCheck.length) scheduleCheck(nodesToCheck);
                            }
                            return { checkedNodes: new Map(), nodeErrors: new Map(), decorations: DecorationSet.empty };
                        },

                        apply(tr, prev: SpellPluginState, _oldState, newState): SpellPluginState {
                            if (!getEnabled()) {
                                return {
                                    checkedNodes: new Map(),
                                    nodeErrors: new Map(),
                                    decorations: DecorationSet.empty,
                                };
                            }

                            // 1. Full refresh (language changed, spellcheck toggled)
                            if (tr.getMeta("spellcheckRefresh")) {
                                wordCache.clear();
                                pendingRequests.clear();
                                const nodesToCheck: Array<{ nodeId: string; words: RelativeWord[]; text: string }> = [];
                                newState.doc.descendants((node: any) => {
                                    if (node.isTextblock) {
                                        const nodeId = node.attrs?.["data-id"];
                                        if (nodeId && SPELLCHECKED_TYPES.has(node.type.name)) {
                                            const { words, text } = extractNodeWords(node);
                                            nodesToCheck.push({ nodeId, words, text });
                                        }
                                        return false; // skip text children
                                    }
                                    return true; // continue descending into structural nodes
                                });
                                scheduleCheck(nodesToCheck);
                                return {
                                    checkedNodes: new Map(),
                                    nodeErrors: new Map(),
                                    decorations: DecorationSet.empty,
                                };
                            }

                            // 2. Viewport Change (Scroll / Resize)
                            // Completely reconstructs the DecorationSet for ONLY the nodes currently visible
                            if (tr.getMeta("spellcheckViewport")) {
                                const { from, to } = tr.getMeta("spellcheckViewport");
                                const decos: Decoration[] = [];

                                newState.doc.nodesBetween(from, to, (node: any, pos: number) => {
                                    if (node.isTextblock) {
                                        const nodeId = node.attrs?.["data-id"];
                                        if (nodeId) {
                                            const errors = prev.nodeErrors.get(nodeId);
                                            if (errors && errors.length > 0) {
                                                const contentStart = pos + 1;
                                                for (const err of errors) {
                                                    decos.push(
                                                        Decoration.inline(
                                                            contentStart + err.relFrom,
                                                            contentStart + err.relTo,
                                                            SPELL_ATTRS,
                                                            { nodeId },
                                                        ),
                                                    );
                                                }
                                            }
                                        }
                                        return false;
                                    }
                                    return true;
                                });

                                return {
                                    checkedNodes: prev.checkedNodes,
                                    nodeErrors: prev.nodeErrors,
                                    decorations: DecorationSet.create(newState.doc, decos),
                                };
                            }

                            // 3. Worker returned results
                            if (tr.getMeta("spellcheckResults")) {
                                const { nodes, misspelled } = tr.getMeta("spellcheckResults") as {
                                    nodes: PendingNode[];
                                    misspelled: string[];
                                };
                                if (!nodes?.length) return prev;

                                const characterWords = getCharacterWords(getCharacters());
                                const misspelledSet = new Set(
                                    misspelled.filter((w) => !characterWords.has(w.toUpperCase())),
                                );

                                const checkedNodes = new Map(prev.checkedNodes);
                                const nodeErrors = new Map(prev.nodeErrors);
                                let decorations = prev.decorations;
                                const newDecos: Decoration[] = [];
                                const nodesToUpdate = new Set<string>();

                                // Map nodeIds to absolute positions to add new decorations
                                const nodePositions = new Map<string, { pos: number; node: any }>();
                                newState.doc.descendants((node: any, pos: number) => {
                                    if (node.isTextblock) {
                                        const nodeId = node.attrs?.["data-id"];
                                        if (nodeId) nodePositions.set(nodeId, { pos, node });
                                        return false; // skip text nodes
                                    }
                                    return true; // continue descending
                                });

                                for (const { nodeId, words, text } of nodes) {
                                    const currentInfo = nodePositions.get(nodeId);
                                    if (!currentInfo) continue; // Node deleted

                                    // Extract current text to check if the node changed while the worker was processing
                                    const currentText = extractNodeWords(currentInfo.node).text;
                                    if (currentText !== text) {
                                        // Stale data. Node text changed. We discard this result.
                                        continue;
                                    }

                                    // Update our cache markers
                                    checkedNodes.set(nodeId, text);
                                    nodesToUpdate.add(nodeId);

                                    // Filter for misspelled words
                                    const errors = words.filter((w) => misspelledSet.has(w.word));
                                    if (errors.length) {
                                        const relErrors = errors.map((err) => ({
                                            relFrom: err.relFrom,
                                            relTo: err.relTo,
                                            word: err.word,
                                        }));
                                        nodeErrors.set(nodeId, relErrors);

                                        const contentStart = currentInfo.pos + 1;
                                        for (const err of relErrors) {
                                            newDecos.push(
                                                Decoration.inline(
                                                    contentStart + err.relFrom,
                                                    contentStart + err.relTo,
                                                    SPELL_ATTRS,
                                                    { nodeId },
                                                ),
                                            );
                                        }
                                    } else {
                                        nodeErrors.delete(nodeId);
                                    }
                                }

                                if (nodesToUpdate.size > 0) {
                                    // Surgically remove old decorations only in the updated nodes
                                    const toRemove: Decoration[] = [];
                                    for (const nodeId of nodesToUpdate) {
                                        const info = nodePositions.get(nodeId);
                                        if (info) {
                                            const nodeDecos = decorations.find(info.pos, info.pos + info.node.nodeSize);
                                            toRemove.push(...nodeDecos.filter((d) => d.spec.nodeId === nodeId));
                                        }
                                    }
                                    if (toRemove.length > 0) {
                                        decorations = decorations.remove(toRemove);
                                    }

                                    // Add the fresh decorations
                                    if (newDecos.length > 0) {
                                        decorations = decorations.add(newState.doc, newDecos);
                                    }
                                }

                                return { checkedNodes, nodeErrors, decorations };
                            }

                            // 4. Document changed — blazingly fast remapping
                            if (tr.docChanged) {
                                // Map all existing decorations to their new positions
                                let start = performance.now();
                                let decorations = prev.decorations.map(tr.mapping, newState.doc);
                                let end = performance.now();
                                let duration = end - start;
                                console.log(`Spellcheck remapping: ${duration.toFixed(4)} ms.`);

                                const checkedNodes = prev.checkedNodes;
                                const nodeErrors = new Map(prev.nodeErrors);

                                // Find which nodes were actually affected by the transaction
                                const affectedMap = new Map<string, { nodeId: string; node: any; pos: number }>();

                                tr.mapping.maps.forEach((stepMap, i) => {
                                    stepMap.forEach((_os: number, _oe: number, ns: number, ne: number) => {
                                        const m = tr.mapping.slice(i + 1);
                                        const mFrom = m.map(ns, -1);
                                        const mTo = m.map(ne, 1);
                                        const from = Math.min(mFrom, mTo);
                                        const to = Math.max(mFrom, mTo);

                                        newState.doc.nodesBetween(from, to, (node: any, pos: number) => {
                                            if (!node.isTextblock) return true;
                                            const nodeId = node.attrs?.["data-id"];
                                            if (nodeId && SPELLCHECKED_TYPES.has(node.type.name)) {
                                                affectedMap.set(nodeId, { nodeId, node, pos });
                                            }
                                            return false;
                                        });
                                    });
                                });

                                if (affectedMap.size > 0) {
                                    const nodesToCheck = [];

                                    for (const { node, nodeId } of affectedMap.values()) {
                                        const { words, text } = extractNodeWords(node);
                                        // Only queue nodes whose text content actually changed.
                                        if (checkedNodes.get(nodeId) !== text) {
                                            nodesToCheck.push({ nodeId, words, text });
                                            // Invalidate global error cache for this node
                                            nodeErrors.delete(nodeId);
                                        }
                                    }

                                    if (nodesToCheck.length > 0) {
                                        scheduleCheck(nodesToCheck);
                                    }
                                }

                                return { checkedNodes, nodeErrors, decorations };
                            }

                            return prev;
                        },
                    },

                    props: {
                        decorations(state) {
                            return spellcheckPluginKey.getState(state)?.decorations;
                        },
                    },
                }),
            ];
        },
    });
};

/**
 * Force the editor to recheck all spellcheck decorations.
 * Call this when the dictionary language changes or spellcheck is toggled.
 */
export const refreshSpellcheck = (editor: Editor) => {
    if (!editor || !editor.view) return;
    editor.view.dispatch(editor.state.tr.setMeta("spellcheckRefresh", true));
};
