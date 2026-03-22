import { Editor, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { SpellWorkerRequest, SpellWorkerResponse } from "./spellcheck-types";

const spellcheckPluginKey = new PluginKey("spellcheck");

/** Unicode-aware word tokenizer — matches words with letters, combining marks, and apostrophes */
const WORD_RE = /[\p{L}\p{M}''\u2019-]+/gu;

/** Debounce delay before sending words to the worker */
const CHECK_DEBOUNCE_MS = 300;

type SpellcheckConfig = {
    /** Return the current Web Worker instance, or null if not ready */
    getWorker: () => Worker | null;
    /** Whether spellchecking is currently enabled */
    getEnabled: () => boolean;
};

interface WordPosition {
    word: string;
    from: number;
    to: number;
}

// ---- Shared utility functions (same logic as search-highlight-extension.ts) ----

function mergeOverlappingRanges(ranges: Array<{ from: number; to: number }>): Array<{ from: number; to: number }> {
    if (ranges.length <= 1) return ranges;
    const sorted = ranges.slice().sort((a, b) => a.from - b.from);
    const merged: Array<{ from: number; to: number }> = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        const last = merged[merged.length - 1];
        if (sorted[i].from <= last.to) {
            last.to = Math.max(last.to, sorted[i].to);
        } else {
            merged.push(sorted[i]);
        }
    }
    return merged;
}

function getChangedRanges(tr: any): Array<{ from: number; to: number }> {
    const ranges: Array<{ from: number; to: number }> = [];
    for (let i = 0; i < tr.mapping.maps.length; i++) {
        const stepMap = tr.mapping.maps[i];
        stepMap.forEach((_oldStart: number, _oldEnd: number, newStart: number, newEnd: number) => {
            const mappedFrom = tr.mapping.slice(i + 1).map(newStart, -1);
            const mappedTo = tr.mapping.slice(i + 1).map(newEnd, 1);
            try {
                const $from = tr.doc.resolve(mappedFrom);
                const $to = tr.doc.resolve(mappedTo);
                ranges.push({
                    from: $from.start($from.depth),
                    to: $to.end($to.depth),
                });
            } catch {
                ranges.push({ from: mappedFrom, to: mappedTo });
            }
        });
    }
    return mergeOverlappingRanges(ranges);
}

// ---- Word extraction ----

function extractWords(doc: any, from: number, to: number): WordPosition[] {
    const words: WordPosition[] = [];
    doc.nodesBetween(from, to, (node: any, pos: number) => {
        if (!node.isText) return;
        const text = node.text || "";
        let match;
        WORD_RE.lastIndex = 0;
        while ((match = WORD_RE.exec(text)) !== null) {
            const wordFrom = pos + match.index;
            const wordTo = wordFrom + match[0].length;
            // Only include words that overlap with the requested range
            if (wordTo > from && wordFrom < to) {
                words.push({ word: match[0], from: wordFrom, to: wordTo });
            }
        }
    });
    return words;
}

// ---- Extension ----

export const createSpellcheckExtension = (config: SpellcheckConfig) => {
    const { getWorker, getEnabled } = config;

    // Word correctness cache: word → true (correct) or false (misspelled)
    const wordCache = new Map<string, boolean>();

    // Monotonically increasing request ID to handle out-of-order responses
    let nextRequestId = 0;
    let latestRequestId = -1;

    // Debounce timer
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    // Reference to the editor view for dispatching result transactions
    let editorView: any = null;

    // Pending words awaiting check (accumulated during debounce window)
    let pendingWords: WordPosition[] = [];

    function scheduleCheck(words: WordPosition[]) {
        // Merge with existing pending words
        pendingWords = pendingWords.concat(words);

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            flushCheck();
        }, CHECK_DEBOUNCE_MS);
    }

    function flushCheck() {
        const worker = getWorker();
        if (!worker || pendingWords.length === 0) {
            pendingWords = [];
            return;
        }

        // Deduplicate words and filter out already-cached ones
        const uniqueWords = new Map<string, boolean>();
        const wordsToCheck: string[] = [];
        for (const wp of pendingWords) {
            if (!uniqueWords.has(wp.word) && !wordCache.has(wp.word)) {
                uniqueWords.set(wp.word, true);
                wordsToCheck.push(wp.word);
            }
        }

        pendingWords = [];

        if (wordsToCheck.length === 0) {
            // All words are cached — dispatch a results transaction to apply decorations from cache
            if (editorView) {
                editorView.dispatch(editorView.state.tr.setMeta("spellcheckResults", { id: -1, misspelled: [] }));
            }
            return;
        }

        const id = nextRequestId++;
        latestRequestId = id;

        const handler = (e: MessageEvent<SpellWorkerResponse>) => {
            const msg = e.data;
            if (msg.type === "CHECK_RESULT" && msg.id === id) {
                worker.removeEventListener("message", handler);

                // Update cache
                const misspelledSet = new Set(msg.misspelled);
                for (const w of wordsToCheck) {
                    wordCache.set(w, !misspelledSet.has(w));
                }

                // Dispatch transaction to apply decorations
                if (editorView) {
                    editorView.dispatch(
                        editorView.state.tr.setMeta("spellcheckResults", {
                            id,
                            misspelled: msg.misspelled,
                        }),
                    );
                }
            }
        };

        worker.addEventListener("message", handler);
        worker.postMessage({ type: "CHECK", id, words: wordsToCheck } satisfies SpellWorkerRequest);
    }

    /**
     * Build decorations for all misspelled words in the document using the cache.
     */
    function buildDecorations(doc: any): DecorationSet {
        if (!getEnabled()) return DecorationSet.empty;

        const allWords = extractWords(doc, 0, doc.content.size);
        const decorations: Decoration[] = [];

        for (const wp of allWords) {
            const cached = wordCache.get(wp.word);
            if (cached === false) {
                // Word is known to be misspelled
                decorations.push(
                    Decoration.inline(wp.from, wp.to, {
                        class: "spellcheck-error",
                        nodeName: "span",
                    }),
                );
            }
        }

        return DecorationSet.create(doc, decorations);
    }

    /**
     * Build decorations only within specific ranges using the cache.
     */
    function buildDecorationsInRanges(
        doc: any,
        ranges: Array<{ from: number; to: number }>,
    ): Decoration[] {
        if (!getEnabled()) return [];

        const decorations: Decoration[] = [];
        for (const range of ranges) {
            const words = extractWords(doc, range.from, range.to);
            for (const wp of words) {
                const cached = wordCache.get(wp.word);
                if (cached === false) {
                    decorations.push(
                        Decoration.inline(wp.from, wp.to, {
                            class: "spellcheck-error",
                            nodeName: "span",
                        }),
                    );
                }
            }
        }
        return decorations;
    }

    return Extension.create({
        name: "spellcheck",

        addProseMirrorPlugins() {
            return [
                new Plugin({
                    key: spellcheckPluginKey,

                    view(view) {
                        editorView = view;
                        return {
                            destroy() {
                                editorView = null;
                                if (debounceTimer) clearTimeout(debounceTimer);
                            },
                        };
                    },

                    state: {
                        init(_, { doc }) {
                            if (!getEnabled()) return DecorationSet.empty;

                            // Schedule initial full-document check
                            const allWords = extractWords(doc, 0, doc.content.size);
                            scheduleCheck(allWords);

                            return DecorationSet.empty;
                        },

                        apply(tr, oldDecorations, _oldState, newState) {
                            if (!getEnabled()) {
                                return DecorationSet.empty;
                            }

                            // Full refresh requested (language changed, etc.)
                            if (tr.getMeta("spellcheckRefresh")) {
                                wordCache.clear();
                                const allWords = extractWords(newState.doc, 0, newState.doc.content.size);
                                scheduleCheck(allWords);
                                return DecorationSet.empty;
                            }

                            // Worker returned results — rebuild decorations from cache
                            if (tr.getMeta("spellcheckResults")) {
                                return buildDecorations(newState.doc);
                            }

                            // Document changed — incremental update
                            if (tr.docChanged) {
                                // Map existing decorations to new positions
                                let mapped = oldDecorations.map(tr.mapping, newState.doc);

                                const changedRanges = getChangedRanges(tr);
                                if (changedRanges.length > 0) {
                                    // Remove stale decorations in changed ranges
                                    for (const range of changedRanges) {
                                        const stale = mapped.find(range.from, range.to);
                                        if (stale.length > 0) {
                                            mapped = mapped.remove(stale);
                                        }
                                    }

                                    // Add cached decorations for changed ranges immediately
                                    const newDecos = buildDecorationsInRanges(newState.doc, changedRanges);
                                    if (newDecos.length > 0) {
                                        mapped = mapped.add(newState.doc, newDecos);
                                    }

                                    // Extract new/changed words and schedule worker check
                                    const wordsToCheck: WordPosition[] = [];
                                    for (const range of changedRanges) {
                                        const words = extractWords(newState.doc, range.from, range.to);
                                        for (const wp of words) {
                                            if (!wordCache.has(wp.word)) {
                                                wordsToCheck.push(wp);
                                            }
                                        }
                                    }
                                    if (wordsToCheck.length > 0) {
                                        scheduleCheck(wordsToCheck);
                                    }
                                }

                                return mapped;
                            }

                            return oldDecorations;
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
 * Force the editor to recompute all spellcheck decorations.
 * Call this when the dictionary language changes or spellcheck is toggled.
 */
export const refreshSpellcheck = (editor: Editor) => {
    if (!editor || !editor.view) return;
    editor.view.dispatch(editor.state.tr.setMeta("spellcheckRefresh", true));
};
