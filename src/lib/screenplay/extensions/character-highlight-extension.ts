import { Editor, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ScreenplayElement } from "../../utils/enums";

const characterHighlightPluginKey = new PluginKey("characterHighlight");

type CharacterHighlightConfig = {
    getHighlightedCharacters: () => Set<string>;
    getCharacterColor: (name: string) => string | undefined;
};

function extractCharacterName(node: any): string {
    const text: string = node.textContent || "";
    return text
        .toUpperCase()
        .replace(/\s*\(.*?\)\s*$/g, "")
        .trim();
}

const DEFAULT_HIGHLIGHT_COLOR = "#6366f1";

function hexToRgba(hex: string, alpha: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return hex;
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function makeDecoration(pos: number, nodeSize: number, color: string): Decoration {
    return Decoration.node(pos, pos + nodeSize, {
        class: "character-highlight",
        style: `--highlight-color: ${color}; --highlight-bg: ${hexToRgba(color, 0.15)};`,
    });
}

/**
 * Walk the full document and build highlight decorations.
 * Used on init and explicit refresh (toggle / color change).
 */
function computeHighlightDecorations(
    doc: any,
    highlighted: Set<string>,
    getColor: (name: string) => string | undefined,
): DecorationSet {
    if (highlighted.size === 0) return DecorationSet.empty;

    const decorations: Decoration[] = [];
    let currentColor: string | null = null;

    doc.forEach((node: any, pos: number) => {
        const cls: string = node.attrs?.class;
        if (cls === ScreenplayElement.Character) {
            const name = extractCharacterName(node);
            if (highlighted.has(name)) {
                currentColor = getColor(name) || DEFAULT_HIGHLIGHT_COLOR;
                decorations.push(makeDecoration(pos, node.nodeSize, currentColor));
            } else {
                currentColor = null;
            }
        } else if (
            (cls === ScreenplayElement.Dialogue || cls === ScreenplayElement.Parenthetical) &&
            currentColor
        ) {
            decorations.push(makeDecoration(pos, node.nodeSize, currentColor));
        } else {
            currentColor = null;
        }
    });

    return DecorationSet.create(doc, decorations);
}

/**
 * Walk a position range and build highlight decorations for it.
 * `from` must be the start position of a Character node (so context is unambiguous).
 */
function computeDecorationsInRange(
    doc: any,
    from: number,
    to: number,
    highlighted: Set<string>,
    getColor: (name: string) => string | undefined,
): Decoration[] {
    const decorations: Decoration[] = [];
    let currentColor: string | null = null;
    let pos = from;

    while (pos < to) {
        const node = doc.nodeAt(pos);
        if (!node) break;

        const cls: string = node.attrs?.class;
        if (cls === ScreenplayElement.Character) {
            const name = extractCharacterName(node);
            if (highlighted.has(name)) {
                currentColor = getColor(name) || DEFAULT_HIGHLIGHT_COLOR;
                decorations.push(makeDecoration(pos, node.nodeSize, currentColor));
            } else {
                currentColor = null;
            }
        } else if (
            (cls === ScreenplayElement.Dialogue || cls === ScreenplayElement.Parenthetical) &&
            currentColor
        ) {
            decorations.push(makeDecoration(pos, node.nodeSize, currentColor));
        } else {
            currentColor = null;
        }

        pos += node.nodeSize;
    }

    return decorations;
}

/**
 * If the transaction affected a Character node, return the range [from, to] in the
 * new document that needs its decorations recomputed. `from` is the position of the
 * first affected Character; `to` extends to the end of its following dialogue block.
 * Returns null if no Character nodes were involved.
 */
function computeChangedRange(tr: any): [number, number] | null {
    if (!tr.docChanged) return null;

    // Collect the overall changed range in the new document
    let changedFrom = Infinity;
    let changedTo = -1;

    for (let i = 0; i < tr.steps.length; i++) {
        tr.steps[i].getMap().forEach(
            (_os: number, _oe: number, newStart: number, newEnd: number) => {
                const m = tr.mapping.slice(i + 1);
                changedFrom = Math.min(changedFrom, m.map(newStart, -1));
                changedTo = Math.max(changedTo, m.map(newEnd, 1));
            },
        );
    }

    if (changedTo === -1) return null;

    const doc = tr.doc;
    const safeFrom = Math.max(0, changedFrom);
    const safeTo = Math.min(changedTo, doc.content.size);

    // Look for a Character node in the changed range
    let characterFound = false;
    let rangeStart = Infinity;

    doc.nodesBetween(safeFrom, safeTo, (node: any, pos: number) => {
        if (node.attrs?.class === ScreenplayElement.Character) {
            characterFound = true;
            rangeStart = Math.min(rangeStart, pos);
        }
    });

    if (!characterFound) return null;

    // Extend `to` forward past the dialogue/parenthetical block following the change
    let walkPos: number;
    try {
        const $to = doc.resolve(safeTo);
        walkPos = $to.depth > 0 ? $to.after(1) : safeTo;
    } catch {
        walkPos = safeTo;
    }

    while (walkPos < doc.content.size) {
        const node = doc.nodeAt(walkPos);
        if (!node) break;
        const cls: string = node.attrs?.class;
        if (cls === ScreenplayElement.Dialogue || cls === ScreenplayElement.Parenthetical) {
            walkPos += node.nodeSize;
        } else {
            break;
        }
    }

    return [rangeStart, walkPos];
}

export const createCharacterHighlightExtension = (config: CharacterHighlightConfig) => {
    const { getHighlightedCharacters, getCharacterColor } = config;

    return Extension.create({
        name: "characterHighlight",

        addProseMirrorPlugins() {
            return [
                new Plugin({
                    key: characterHighlightPluginKey,
                    state: {
                        init(_, { doc }) {
                            return computeHighlightDecorations(doc, getHighlightedCharacters(), getCharacterColor);
                        },
                        apply(tr, oldDecorations, _oldState, newState) {
                            // Explicit refresh (highlight toggled, color changed)
                            if (tr.getMeta("characterHighlightRefresh")) {
                                return computeHighlightDecorations(
                                    tr.doc,
                                    getHighlightedCharacters(),
                                    getCharacterColor,
                                );
                            }

                            if (getHighlightedCharacters().size === 0) {
                                return DecorationSet.empty;
                            }

                            if (!tr.docChanged) {
                                return oldDecorations;
                            }

                            // Map existing decorations to new positions (cheap, O(decorations))
                            const mapped = oldDecorations.map(tr.mapping, newState.doc);

                            // Compute the range affected by Character node changes
                            const range = computeChangedRange(tr);
                            if (!range) {
                                // No Character nodes changed — mapped positions are correct
                                return mapped;
                            }

                            const [from, to] = range;

                            // Replace decorations in the affected range only
                            const outside = [
                                ...mapped.find(0, from),
                                ...mapped.find(to, newState.doc.content.size),
                            ];
                            const inside = computeDecorationsInRange(
                                newState.doc,
                                from,
                                to,
                                getHighlightedCharacters(),
                                getCharacterColor,
                            );

                            return DecorationSet.create(newState.doc, [...outside, ...inside]);
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
 * Force the editor to recompute character highlight decorations.
 * Call this when the highlighted characters set or character colors change.
 */
export const refreshCharacterHighlights = (editor: Editor) => {
    if (!editor?.view) return;
    editor.view.dispatch(editor.state.tr.setMeta("characterHighlightRefresh", true));
};
