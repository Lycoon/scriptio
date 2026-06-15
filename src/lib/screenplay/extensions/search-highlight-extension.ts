import { Editor, Extension } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ScreenplayElement } from "../../utils/enums";
import { timeApply } from "./apply-timing";

const searchHighlightPluginKey = new PluginKey("searchHighlight");

export type SearchMatch = {
    from: number;
    to: number;
    nodeType: ScreenplayElement;
};

type SearchHighlightConfig = {
    getSearchTerm: () => string;
    getEnabledFilters: () => Set<ScreenplayElement>;
    getCurrentMatchIndex: () => number;
    onMatchesFound: (matches: SearchMatch[]) => void;
    /**
     * Returns the editor search currently targets. Optional: when provided, this
     * instance only highlights and reports matches while it belongs to the active
     * editor, so search is scoped to the focused panel and several open editors
     * don't clobber the single shared match list. Omitted → always active.
     */
    getActiveEditor?: () => Editor | null;
};

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Merge overlapping or adjacent ranges into a minimal set of non-overlapping ranges.
 */
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

/**
 * Extract the document ranges affected by a transaction's steps.
 * Ranges are expanded to parent node boundaries so regex matches at edit
 * boundaries are correctly found.
 */
function getChangedRanges(tr: Transaction): Array<{ from: number; to: number }> {
    const ranges: Array<{ from: number; to: number }> = [];
    for (let i = 0; i < tr.mapping.maps.length; i++) {
        const stepMap = tr.mapping.maps[i];
        stepMap.forEach((oldStart: number, oldEnd: number, newStart: number, newEnd: number) => {
            // Map through any subsequent steps to get final document positions
            const mappedFrom = tr.mapping.slice(i + 1).map(newStart, -1);
            const mappedTo = tr.mapping.slice(i + 1).map(newEnd, 1);
            try {
                const $from = tr.doc.resolve(mappedFrom);
                const $to = tr.doc.resolve(mappedTo);
                // Only expand to parent block boundaries when inside a block
                // node (depth > 0). At depth 0 (between top-level blocks, e.g.
                // after pagination inserts a page break), expanding would cover
                // the entire document — use raw positions instead.
                ranges.push({
                    from: $from.depth > 0 ? $from.start($from.depth) : mappedFrom,
                    to: $to.depth > 0 ? $to.end($to.depth) : mappedTo,
                });
            } catch {
                ranges.push({ from: mappedFrom, to: mappedTo });
            }
        });
    }
    return mergeOverlappingRanges(ranges);
}

/**
 * Scan text nodes within a specific range for search matches.
 */
function scanRangeForMatches(
    doc: Node,
    from: number,
    to: number,
    searchTerm: string,
    enabledFilters: Set<ScreenplayElement>,
): SearchMatch[] {
    const matches: SearchMatch[] = [];
    const regex = new RegExp(escapeRegex(searchTerm), "gi");

    doc.nodesBetween(from, to, (node: Node, pos: number) => {
        if (!node.isText) return;

        const resolvedPos = doc.resolve(pos);
        const parent = resolvedPos.parent;
        const nodeClass = parent?.attrs?.class as ScreenplayElement | undefined;

        if (nodeClass && !enabledFilters.has(nodeClass)) {
            return;
        }

        const text = node.text || "";
        let match;

        while ((match = regex.exec(text)) !== null) {
            const matchFrom = pos + match.index;
            const matchTo = matchFrom + match[0].length;

            matches.push({
                from: matchFrom,
                to: matchTo,
                nodeType: nodeClass || ScreenplayElement.None,
            });
        }
    });

    return matches;
}

/**
 * Computes decorations for search matches across the entire document.
 * Returns both the DecorationSet and the list of matches for navigation.
 */
function computeSearchDecorations(
    doc: Node,
    searchTerm: string,
    enabledFilters: Set<ScreenplayElement>,
    currentMatchIndex: number,
): { decorations: DecorationSet; matches: SearchMatch[] } {
    if (!searchTerm || searchTerm.trim() === "") {
        return { decorations: DecorationSet.empty, matches: [] };
    }

    const matches = scanRangeForMatches(doc, 0, doc.content.size, searchTerm, enabledFilters);
    const decorations: Decoration[] = [];

    matches.forEach((match, index) => {
        const isCurrentMatch = index === currentMatchIndex;
        decorations.push(
            Decoration.inline(match.from, match.to, {
                class: isCurrentMatch ? "search-highlight search-highlight-current" : "search-highlight",
            }),
        );
    });

    return { decorations: DecorationSet.create(doc, decorations), matches };
}

/**
 * Apply the currentMatchIndex CSS class to exactly one decoration in the set.
 * Returns a new DecorationSet with the correct "current" highlight applied.
 */
function applyCurrentMatchClass(
    doc: Node,
    decoSet: DecorationSet,
    matches: SearchMatch[],
    currentMatchIndex: number,
): DecorationSet {
    if (currentMatchIndex < 0 || currentMatchIndex >= matches.length) {
        return decoSet;
    }

    const currentMatch = matches[currentMatchIndex];
    // Find decorations at the current match position
    const atCurrent = decoSet.find(currentMatch.from, currentMatch.to);
    // Check if the current decoration already has the correct class
    const existing = atCurrent.find((d) => {
        const spec = (d as { type?: { attrs?: { class?: string } } }).type?.attrs?.class;
        return spec && spec.includes("search-highlight-current");
    });
    if (existing) return decoSet;

    // Remove the old decoration at this position and add one with the current class
    const toRemove = atCurrent.filter((d) => {
        const spec = (d as { type?: { attrs?: { class?: string } } }).type?.attrs?.class;
        return spec && spec.includes("search-highlight");
    });
    let result = decoSet;
    if (toRemove.length > 0) {
        result = result.remove(toRemove);
    }
    result = result.add(doc, [
        Decoration.inline(currentMatch.from, currentMatch.to, {
            class: "search-highlight search-highlight-current",
        }),
    ]);

    return result;
}

export const createSearchHighlightExtension = (config: SearchHighlightConfig) => {
    const { getSearchTerm, getEnabledFilters, getCurrentMatchIndex, onMatchesFound, getActiveEditor } = config;

    // Track previous state to avoid unnecessary updates
    let previousMatchCount = 0;
    let previousSearchTerm = "";
    // Cached matches array for incremental updates
    let cachedMatches: SearchMatch[] = [];

    return Extension.create({
        name: "searchHighlight",

        addProseMirrorPlugins() {
            // `this.editor` is the instance this extension is bound to. Search is
            // scoped to the focused editor: only the active instance highlights
            // and reports matches (see getActiveEditor above).
            const ownEditor = this.editor;
            const isActive = () => !getActiveEditor || getActiveEditor() === ownEditor;

            return [
                new Plugin({
                    key: searchHighlightPluginKey,
                    state: {
                        init(_, { doc }) {
                            if (!isActive()) return DecorationSet.empty;
                            const searchTerm = getSearchTerm();
                            const result = computeSearchDecorations(
                                doc,
                                searchTerm,
                                getEnabledFilters(),
                                getCurrentMatchIndex(),
                            );
                            previousMatchCount = result.matches.length;
                            previousSearchTerm = searchTerm;
                            cachedMatches = result.matches;
                            onMatchesFound(result.matches);
                            return result.decorations;
                        },
                        apply: timeApply("search-highlight", (tr, oldDecorations, _oldState, newState) => {
                            // Not the active search editor: render nothing and don't report
                            // matches (the active editor owns the shared match list). Reset
                            // bookkeeping so re-activation recomputes from scratch.
                            if (!isActive()) {
                                if (previousSearchTerm !== "" || previousMatchCount !== 0 || cachedMatches.length !== 0) {
                                    previousSearchTerm = "";
                                    previousMatchCount = 0;
                                    cachedMatches = [];
                                }
                                return DecorationSet.empty;
                            }

                            const searchTerm = getSearchTerm();

                            // Fast path: no search term and wasn't searching before
                            if (!searchTerm && !previousSearchTerm) {
                                return DecorationSet.empty;
                            }

                            // Fast path: nothing changed
                            if (
                                searchTerm === previousSearchTerm &&
                                !tr.docChanged &&
                                !tr.getMeta("searchHighlightRefresh")
                            ) {
                                return oldDecorations;
                            }

                            // Full rebuild needed when: search term changed, filters changed, or
                            // explicit refresh (current match index changed)
                            if (searchTerm !== previousSearchTerm || tr.getMeta("searchHighlightRefresh")) {
                                const enabledFilters = getEnabledFilters();
                                const currentMatchIndex = getCurrentMatchIndex();
                                const result = computeSearchDecorations(
                                    newState.doc,
                                    searchTerm,
                                    enabledFilters,
                                    currentMatchIndex,
                                );
                                cachedMatches = result.matches;
                                if (result.matches.length !== previousMatchCount || searchTerm !== previousSearchTerm) {
                                    previousMatchCount = result.matches.length;
                                    previousSearchTerm = searchTerm;
                                    onMatchesFound(result.matches);
                                }
                                previousSearchTerm = searchTerm;
                                return result.decorations;
                            }

                            // Incremental update: document changed but search term is the same.
                            // Map existing decorations to new positions, then patch only changed ranges.
                            const mapped = oldDecorations.map(tr.mapping, newState.doc);
                            const changedRanges = getChangedRanges(tr);

                            if (changedRanges.length === 0) {
                                return mapped;
                            }

                            const enabledFilters = getEnabledFilters();
                            let result = mapped;

                            // Remove stale decorations in changed ranges
                            for (const range of changedRanges) {
                                const stale = result.find(range.from, range.to);
                                if (stale.length > 0) {
                                    result = result.remove(stale);
                                }
                            }

                            // Scan only the changed ranges for new matches
                            const newDecorations: Decoration[] = [];
                            const freshMatches: SearchMatch[] = [];
                            for (const range of changedRanges) {
                                const rangeMatches = scanRangeForMatches(
                                    newState.doc,
                                    range.from,
                                    range.to,
                                    searchTerm,
                                    enabledFilters,
                                );
                                for (const m of rangeMatches) {
                                    freshMatches.push(m);
                                    newDecorations.push(
                                        Decoration.inline(m.from, m.to, {
                                            class: "search-highlight",
                                        }),
                                    );
                                }
                            }
                            if (newDecorations.length > 0) {
                                result = result.add(newState.doc, newDecorations);
                            }

                            // Incrementally update cachedMatches: map surviving
                            // positions, drop matches in changed ranges, merge
                            // with freshly scanned matches. Avoids the expensive
                            // matchesFromDecorations() full-document scan.
                            const mappedCached: SearchMatch[] = [];
                            for (const m of cachedMatches) {
                                const from = tr.mapping.map(m.from, 1);
                                const to = tr.mapping.map(m.to, -1);
                                if (from >= to) continue;
                                let overlaps = false;
                                for (const range of changedRanges) {
                                    if (from < range.to && to > range.from) {
                                        overlaps = true;
                                        break;
                                    }
                                }
                                if (!overlaps) {
                                    mappedCached.push({ from, to, nodeType: m.nodeType });
                                }
                            }
                            const newMatches = mappedCached.concat(freshMatches).sort((a, b) => a.from - b.from);
                            cachedMatches = newMatches;

                            // Apply current match highlight
                            const currentMatchIndex = getCurrentMatchIndex();
                            result = applyCurrentMatchClass(newState.doc, result, newMatches, currentMatchIndex);

                            // Notify if match count changed
                            if (newMatches.length !== previousMatchCount) {
                                previousMatchCount = newMatches.length;
                                onMatchesFound(newMatches);
                            }

                            return result;
                        }),
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
 * Force the editor to recompute search highlight decorations.
 * Call this when search term, filters, or current match index changes.
 */
export const refreshSearchHighlights = (editor: Editor) => {
    if (!editor || !editor.view) return;
    // Dispatch an empty transaction to trigger decoration recomputation
    editor.view.dispatch(editor.state.tr.setMeta("searchHighlightRefresh", true));
};

/**
 * Scrolls the editor to show the match at the given position, centered in the view.
 * Uses instant scrolling to avoid stutter from overlapping smooth scroll animations
 * when rapidly navigating between matches (especially on Chromium-based browsers).
 */
export const scrollToMatch = (editor: Editor, match: SearchMatch) => {
    if (!editor || !match) return;

    // Get the DOM position of the match
    const { node } = editor.view.domAtPos(match.from);
    const element = node instanceof HTMLElement ? node : node.parentElement;

    if (element) {
        element.scrollIntoView({ behavior: "instant", block: "center" });
    }
};
