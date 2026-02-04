import { Editor, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ScreenplayElement } from "../../utils/enums";

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
};

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Computes decorations for search matches.
 * Returns both the DecorationSet and the list of matches for navigation.
 */
function computeSearchDecorations(
    doc: any,
    searchTerm: string,
    enabledFilters: Set<ScreenplayElement>,
    currentMatchIndex: number
): { decorations: DecorationSet; matches: SearchMatch[] } {
    if (!searchTerm || searchTerm.trim() === "") {
        return { decorations: DecorationSet.empty, matches: [] };
    }

    const decorations: Decoration[] = [];
    const matches: SearchMatch[] = [];
    const regex = new RegExp(escapeRegex(searchTerm), "gi");

    doc.descendants((node: any, pos: number) => {
        // Only search in text nodes
        if (!node.isText) return;

        // Get the parent node to check its type
        const resolvedPos = doc.resolve(pos);
        const parent = resolvedPos.parent;
        const nodeClass = parent?.attrs?.class as ScreenplayElement | undefined;

        // Skip if the node type is not in the enabled filters
        if (nodeClass && !enabledFilters.has(nodeClass)) {
            return;
        }

        const text = node.text || "";
        let match;

        while ((match = regex.exec(text)) !== null) {
            const from = pos + match.index;
            const to = from + match[0].length;

            matches.push({
                from,
                to,
                nodeType: nodeClass || ScreenplayElement.None,
            });
        }
    });

    // Create decorations from matches
    matches.forEach((match, index) => {
        const isCurrentMatch = index === currentMatchIndex;
        decorations.push(
            Decoration.inline(match.from, match.to, {
                class: isCurrentMatch ? "search-highlight search-highlight-current" : "search-highlight",
            })
        );
    });

    return { decorations: DecorationSet.create(doc, decorations), matches };
}

export const createSearchHighlightExtension = (config: SearchHighlightConfig) => {
    const { getSearchTerm, getEnabledFilters, getCurrentMatchIndex, onMatchesFound } = config;

    // Track previous matches to avoid unnecessary state updates
    let previousMatchCount = 0;
    let previousSearchTerm = "";

    return Extension.create({
        name: "searchHighlight",

        addProseMirrorPlugins() {
            return [
                new Plugin({
                    key: searchHighlightPluginKey,
                    state: {
                        init(_, { doc }) {
                            const searchTerm = getSearchTerm();
                            const result = computeSearchDecorations(
                                doc,
                                searchTerm,
                                getEnabledFilters(),
                                getCurrentMatchIndex()
                            );
                            // Notify about matches on init
                            previousMatchCount = result.matches.length;
                            previousSearchTerm = searchTerm;
                            onMatchesFound(result.matches);
                            return result.decorations;
                        },
                        apply(tr, oldDecorations, _oldState, newState) {
                            const searchTerm = getSearchTerm();

                            // Fast path: if no search term and wasn't searching before, skip computation
                            if (!searchTerm && !previousSearchTerm) {
                                return DecorationSet.empty;
                            }

                            // Fast path: if search term hasn't changed and document hasn't changed,
                            // only recompute if explicitly refreshed (e.g., current match index changed)
                            if (
                                searchTerm === previousSearchTerm &&
                                !tr.docChanged &&
                                !tr.getMeta("searchHighlightRefresh")
                            ) {
                                return oldDecorations;
                            }

                            // Recompute decorations
                            const result = computeSearchDecorations(
                                tr.doc,
                                searchTerm,
                                getEnabledFilters(),
                                getCurrentMatchIndex()
                            );
                            // Only notify about matches if the count or search term changed
                            // This prevents excessive React state updates during navigation
                            if (result.matches.length !== previousMatchCount || searchTerm !== previousSearchTerm) {
                                previousMatchCount = result.matches.length;
                                previousSearchTerm = searchTerm;
                                onMatchesFound(result.matches);
                            }
                            return result.decorations;
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
 * Force the editor to recompute search highlight decorations.
 * Call this when search term, filters, or current match index changes.
 */
export const refreshSearchHighlights = (editor: Editor) => {
    if (!editor) return;
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
