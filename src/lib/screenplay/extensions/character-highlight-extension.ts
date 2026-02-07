import { Editor, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ScreenplayElement } from "../../utils/enums";
import { getNodeFlattenContent } from "../screenplay";

const characterHighlightPluginKey = new PluginKey("characterHighlight");

type CharacterHighlightConfig = {
    getHighlightedCharacters: () => Set<string>;
    getCharacterColor: (name: string) => string | undefined;
};

/**
 * Extracts the clean character name from a node (removes extensions like V.O., O.S., etc.)
 */
function extractCharacterName(node: any): string {
    if (!node.content) return "";
    const text = getNodeFlattenContent(node.content);
    return text
        .toUpperCase()
        .replace(/\s*\(.*?\)\s*$/g, "")
        .trim();
}

// Default highlight color when character has no assigned color
const DEFAULT_HIGHLIGHT_COLOR = "#6366f1"; // Indigo

/**
 * Converts a hex color to rgba with alpha for background highlighting
 */
function hexToRgba(hex: string, alpha: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return hex;
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Computes decorations for character dialogues and parentheticals.
 * Highlights dialogue/parenthetical nodes that follow a highlighted character.
 */
function computeHighlightDecorations(
    doc: any,
    highlightedCharacters: Set<string>,
    getCharacterColor: (name: string) => string | undefined,
): DecorationSet {
    if (highlightedCharacters.size === 0) {
        return DecorationSet.empty;
    }

    const decorations: Decoration[] = [];
    let currentColor: string | null = null;

    doc.forEach((node: any, pos: number) => {
        const nodeClass: string = node.attrs?.class;

        if (nodeClass === ScreenplayElement.Character) {
            const name = extractCharacterName(node.content);
            if (highlightedCharacters.has(name)) {
                currentColor = getCharacterColor(name) || DEFAULT_HIGHLIGHT_COLOR;
                // Also highlight the character name node
                decorations.push(
                    Decoration.node(pos, pos + node.nodeSize, {
                        class: "character-highlight",
                        style: `--highlight-color: ${currentColor}; --highlight-bg: ${hexToRgba(currentColor, 0.15)};`,
                    }),
                );
            } else {
                currentColor = null;
            }
        } else if (
            (nodeClass === ScreenplayElement.Dialogue || nodeClass === ScreenplayElement.Parenthetical) &&
            currentColor
        ) {
            // Apply decoration to dialogue/parenthetical following a highlighted character
            decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                    class: "character-highlight",
                    style: `--highlight-color: ${currentColor}; --highlight-bg: ${hexToRgba(currentColor, 0.15)};`,
                }),
            );
        } else {
            // Reset when hitting non-dialogue elements (action, scene heading, transition, etc.)
            currentColor = null;
        }
    });

    return DecorationSet.create(doc, decorations);
}

/**
 * Check if the transaction affects any Character nodes (which would require recomputation)
 */
function didCharacterNodesChange(tr: any): boolean {
    if (!tr.docChanged) return false;

    // Check if any step affects a Character node
    for (const step of tr.steps) {
        const stepMap = step.getMap();
        let affectsCharacter = false;
        stepMap.forEach((oldStart: number, oldEnd: number) => {
            try {
                const $pos = tr.docs[0]?.resolve(oldStart);
                if ($pos) {
                    const node = $pos.nodeAfter || $pos.parent;
                    if (node?.attrs?.class === ScreenplayElement.Character) {
                        affectsCharacter = true;
                    }
                }
            } catch {
                // Position out of bounds, skip
            }
        });
        if (affectsCharacter) return true;
    }

    return false;
}

export const createCharacterHighlightExtension = (config: CharacterHighlightConfig) => {
    return Extension.create({
        name: "characterHighlight",

        addProseMirrorPlugins() {
            const { getHighlightedCharacters, getCharacterColor } = config;

            return [
                new Plugin({
                    key: characterHighlightPluginKey,
                    state: {
                        init(_, { doc }) {
                            return computeHighlightDecorations(doc, getHighlightedCharacters(), getCharacterColor);
                        },
                        apply(tr, oldDecorations, _oldState, newState) {
                            // Always recompute when explicitly refreshed (highlight toggled from UI)
                            if (tr.getMeta("characterHighlightRefresh")) {
                                return computeHighlightDecorations(tr.doc, getHighlightedCharacters(), getCharacterColor);
                            }

                            // If no highlighted characters, return empty
                            if (getHighlightedCharacters().size === 0) {
                                return DecorationSet.empty;
                            }

                            // If document changed, check if Character nodes were affected
                            if (tr.docChanged) {
                                // For efficiency, check if the change might affect character highlighting
                                if (didCharacterNodesChange(tr)) {
                                    return computeHighlightDecorations(tr.doc, getHighlightedCharacters(), getCharacterColor);
                                }
                                // Simple text edit - just map existing decorations to new positions
                                return oldDecorations.map(tr.mapping, newState.doc);
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
 * Force the editor to recompute character highlight decorations.
 * Call this when the highlighted characters set or character colors change.
 */
export const refreshCharacterHighlights = (editor: Editor) => {
    if (!editor) return;
    // Dispatch an empty transaction to trigger decoration recomputation
    editor.view.dispatch(editor.state.tr.setMeta("characterHighlightRefresh", true));
};
