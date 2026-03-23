import { Editor, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { SpellWorkerRequest, SpellWorkerResponse } from "./spellcheck-types";

const spellcheckPluginKey = new PluginKey("spellcheck");

/** Unicode-aware word tokenizer — matches words with letters, combining marks, hyphens, and apostrophes */
const WORD_RE = /[\p{L}\p{M}''\u2019-]+/gu;
/** Filters out pure-punctuation matches like "-" or "--" that have no letter content */
const HAS_LETTER_RE = /\p{L}/u;

/** Debounce delay before sending words to the worker */
const CHECK_DEBOUNCE_MS = 300;

type SpellcheckConfig = {
    /** Return the current Web Worker instance, or null if not ready */
    getWorker: () => Worker | null;
    /** Whether spellchecking is currently enabled */
    getEnabled: () => boolean;
    /** Return the current character map (keys are uppercase character names) */
    getCharacters: () => Record<string, unknown> | undefined;
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
        // Only process textblock nodes (paragraphs, headings, etc.)
        // Recurse into structural nodes (doc, sections, lists, etc.)
        if (!node.isTextblock) return true;
        if (node.type.name === "character") return false;

        // Concatenate all inline text within this block into a single string,
        // tracking the absolute doc position of each character.
        // This ensures words split across text nodes by marks (bold, italic, etc.)
        // are still matched as whole words.
        const absPositions: number[] = [];
        let combined = "";

        node.forEach((child: any, offset: number) => {
            if (child.isText) {
                const childPos = pos + 1 + offset;
                const text = child.text || "";
                for (let i = 0; i < text.length; i++) {
                    absPositions.push(childPos + i);
                    combined += text[i];
                }
            } else {
                // Non-text inline node (hard break, etc.) — acts as word separator
                combined += "\n";
                absPositions.push(-1);
            }
        });

        WORD_RE.lastIndex = 0;
        let match;
        while ((match = WORD_RE.exec(combined)) !== null) {
            // Skip pure-punctuation matches (e.g. lone "-" in scene headings)
            if (!HAS_LETTER_RE.test(match[0])) continue;

            const si = match.index;
            const ei = si + match[0].length - 1;
            if (absPositions[si] < 0 || absPositions[ei] < 0) continue;

            const wordFrom = absPositions[si];
            const wordTo = absPositions[ei] + 1;

            if (wordTo > from && wordFrom < to) {
                words.push({ word: match[0], from: wordFrom, to: wordTo });
            }
        }

        return false; // don't recurse into textblock children
    });
    return words;
}

// ---- Extension ----

/** Shared attrs object — ProseMirror uses reference equality first in attrsEq,
 *  so reusing the same object avoids unnecessary DOM reconciliation. */
const SPELL_ATTRS = { class: "spellcheck-error", nodeName: "span" };

/**
 * Build a set of uppercase token words from character names.
 * Character map keys are already uppercase (e.g. "JOHN SMITH" → {"JOHN", "SMITH"}).
 */
function buildCharacterWordSet(characters: Record<string, unknown> | undefined): Set<string> {
    if (!characters) return new Set();
    const words = new Set<string>();
    for (const name of Object.keys(characters)) {
        for (const token of name.split(/\s+/)) {
            if (token) words.add(token);
        }
    }
    return words;
}

export const createSpellcheckExtension = (config: SpellcheckConfig) => {
    const { getWorker, getEnabled, getCharacters } = config;

    // Word correctness cache: word → true (correct) or false (misspelled)
    const wordCache = new Map<string, boolean>();

    // Monotonically increasing request ID to handle out-of-order responses
    let nextRequestId = 0;

    // Debounce timer
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    // Reference to the editor view for dispatching result transactions
    let editorView: any = null;

    // Pending words awaiting check (accumulated during debounce window)
    let pendingWords: WordPosition[] = [];

    function scheduleCheck(words: WordPosition[]) {
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

        // Deduplicate words and separate cached from uncached, skipping character names
        const characterWords = buildCharacterWordSet(getCharacters());
        const seen = new Set<string>();
        const wordsToCheck: string[] = [];
        const cachedMisspelled: string[] = [];
        for (const wp of pendingWords) {
            if (seen.has(wp.word)) continue;
            seen.add(wp.word);
            if (characterWords.has(wp.word.toUpperCase())) continue;
            const cached = wordCache.get(wp.word);
            if (cached === undefined) {
                wordsToCheck.push(wp.word);
            } else if (cached === false) {
                cachedMisspelled.push(wp.word);
            }
        }

        pendingWords = [];

        if (wordsToCheck.length === 0) {
            // All words are cached — add positions for any cached misspelled words
            if (cachedMisspelled.length > 0 && editorView) {
                editorView.dispatch(
                    editorView.state.tr.setMeta("spellcheckResults", { id: -1, misspelled: cachedMisspelled }),
                );
            }
            return;
        }

        const id = nextRequestId++;

        const handler = (e: MessageEvent<SpellWorkerResponse>) => {
            const msg = e.data;
            if (msg.type === "CHECK_RESULT" && msg.id === id) {
                worker.removeEventListener("message", handler);

                // Update cache
                const misspelledSet = new Set(msg.misspelled);
                for (const w of wordsToCheck) {
                    wordCache.set(w, !misspelledSet.has(w));
                }

                // Dispatch transaction to apply positions
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
                        init(_, { doc }): DecorationSet {
                            if (!getEnabled()) return DecorationSet.empty;

                            // Schedule initial full-document check
                            scheduleCheck(extractWords(doc, 0, doc.content.size));

                            return DecorationSet.empty;
                        },

                        apply(tr, decorSet: DecorationSet, _oldState, newState): DecorationSet {
                            if (!getEnabled()) {
                                return DecorationSet.empty;
                            }

                            // Full refresh requested (language changed, etc.)
                            if (tr.getMeta("spellcheckRefresh")) {
                                wordCache.clear();
                                scheduleCheck(extractWords(newState.doc, 0, newState.doc.content.size));
                                return DecorationSet.empty;
                            }

                            // Worker returned results — add decorations for newly-misspelled words
                            if (tr.getMeta("spellcheckResults")) {
                                const { misspelled } = tr.getMeta("spellcheckResults") as { misspelled: string[] };
                                if (!misspelled?.length) return decorSet;

                                const characterWords = buildCharacterWordSet(getCharacters());
                                const misspelledSet = new Set(
                                    misspelled.filter((w) => !characterWords.has(w.toUpperCase())),
                                );

                                // Build set of existing decoration positions for dedup
                                const existing = decorSet.find(0, newState.doc.content.size);
                                const existingKeys = new Set<string>(existing.map((d) => `${d.from}:${d.to}`));

                                const newDecorations: Decoration[] = [];
                                for (const wp of extractWords(newState.doc, 0, newState.doc.content.size)) {
                                    if (misspelledSet.has(wp.word)) {
                                        const key = `${wp.from}:${wp.to}`;
                                        if (!existingKeys.has(key)) {
                                            newDecorations.push(Decoration.inline(wp.from, wp.to, SPELL_ATTRS));
                                            existingKeys.add(key);
                                        }
                                    }
                                }

                                return newDecorations.length ? decorSet.add(newState.doc, newDecorations) : decorSet;
                            }

                            // Document changed — map decorations through the transaction, then patch changed ranges
                            if (tr.docChanged) {
                                // DecorationSet.map() efficiently updates all positions in one pass,
                                // sharing unchanged subtrees (persistent data structure).
                                let mapped = decorSet.map(tr.mapping, tr.doc);

                                const changedRanges = getChangedRanges(tr);
                                if (changedRanges.length === 0) return mapped;

                                // Remove decorations whose words may have changed
                                for (const range of changedRanges) {
                                    const stale = mapped.find(range.from, range.to);
                                    if (stale.length) mapped = mapped.remove(stale);
                                }

                                // Re-add from cache or schedule uncached words for checking
                                const characterWords = buildCharacterWordSet(getCharacters());
                                const additions: Decoration[] = [];
                                const toSchedule: WordPosition[] = [];
                                for (const range of changedRanges) {
                                    for (const wp of extractWords(newState.doc, range.from, range.to)) {
                                        if (characterWords.has(wp.word.toUpperCase())) continue;
                                        const cached = wordCache.get(wp.word);
                                        if (cached === false) {
                                            additions.push(Decoration.inline(wp.from, wp.to, SPELL_ATTRS));
                                        } else if (cached === undefined) {
                                            toSchedule.push(wp);
                                        }
                                    }
                                }

                                if (toSchedule.length) scheduleCheck(toSchedule);
                                return additions.length ? mapped.add(tr.doc, additions) : mapped;
                            }

                            return decorSet;
                        },
                    },

                    props: {
                        // DecorationSet is stored directly in plugin state — no rebuild on every call.
                        decorations(state) {
                            return spellcheckPluginKey.getState(state);
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
