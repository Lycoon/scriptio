import { Extension } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReplaceStep, Step } from "@tiptap/pm/transform";
import { ScreenplayElement } from "../../utils/enums";

const fountainInputRulesPluginKey = new PluginKey("fountainInputRules");

// Fountain forced element prefixes
const FOUNTAIN_PREFIXES: Record<string, ScreenplayElement> = {
    ".": ScreenplayElement.Scene, // Forced scene heading
    "@": ScreenplayElement.Character, // Forced character
    "!": ScreenplayElement.Action, // Forced action
    ">": ScreenplayElement.Transition, // Forced transition
    "#": ScreenplayElement.Section, // Section heading
};

// Valid screenplay node types
const SCREENPLAY_NODE_TYPES = new Set<string>([
    ScreenplayElement.Scene,
    ScreenplayElement.Action,
    ScreenplayElement.Character,
    ScreenplayElement.Dialogue,
    ScreenplayElement.Parenthetical,
    ScreenplayElement.Transition,
    ScreenplayElement.Section,
    ScreenplayElement.Note,
]);

/**
 * Check if a node is a screenplay element node.
 */
function isScreenplayNode(nodeName: string): boolean {
    return SCREENPLAY_NODE_TYPES.has(nodeName);
}

/**
 * Get the current element type from a node.
 * The type name IS the element type.
 */
function getNodeElementType(node: Node): string {
    return node.type.name;
}

// Check if text is all uppercase (for automatic character detection)
function isAllUppercase(text: string): boolean {
    // Must have at least one letter and all letters must be uppercase
    const hasLetter = /[a-zA-Z]/.test(text);
    const trimmed = text.trim();
    // Allow letters, spaces, numbers, and common punctuation in character names
    const isUpper = trimmed === trimmed.toUpperCase() && hasLetter;
    return isUpper && trimmed.length > 0;
}

// Check if line starts with note syntax [[
function startsWithNote(text: string): boolean {
    return text.startsWith("[[");
}

export interface FountainInputRulesOptions {
    enabled: boolean;
}

export const FountainExtension = Extension.create<FountainInputRulesOptions>({
    name: "fountainInputRules",

    addOptions() {
        return {
            enabled: true,
        };
    },

    addProseMirrorPlugins() {
        const extensionOptions = this.options;

        return [
            new Plugin({
                key: fountainInputRulesPluginKey,

                appendTransaction(transactions, _oldState, newState) {
                    if (!extensionOptions.enabled) return null;

                    // Only process if there was a document change
                    const docChanged = transactions.some((tr) => tr.docChanged);
                    if (!docChanged) return null;

                    const { selection } = newState;
                    const { $from } = selection;

                    // Get the current node
                    const node = $from.parent;
                    if (!isScreenplayNode(node.type.name)) return null;

                    const text = node.textContent;
                    if (!text) return null;

                    const currentElementType = getNodeElementType(node);

                    // Check for forced element prefixes
                    const firstChar = text[0];
                    const forcedElement = FOUNTAIN_PREFIXES[firstChar];

                    if (forcedElement) {
                        if (currentElementType === forcedElement) return null;

                        // Get the position of the node
                        const nodeStart = $from.before();

                        // Get the target node type from the schema
                        const targetNodeType = newState.schema.nodes[forcedElement];
                        if (!targetNodeType) return null;

                        // Create transaction to change element type and remove prefix
                        const tr = newState.tr;

                        // Change the node type to the new element type
                        tr.setNodeMarkup(nodeStart, targetNodeType, {
                            class: forcedElement,
                        });

                        // Then remove the prefix character
                        // The text starts at nodeStart + 1 (after the opening tag position)
                        tr.delete(nodeStart + 1, nodeStart + 2);

                        return tr;
                    }

                    // Check for note syntax [[
                    if (startsWithNote(text)) {
                        if (currentElementType === ScreenplayElement.Note) return null;

                        const nodeStart = $from.before();

                        // Get the target node type from the schema
                        const targetNodeType = newState.schema.nodes[ScreenplayElement.Note];
                        if (!targetNodeType) return null;

                        const tr = newState.tr;
                        tr.setNodeMarkup(nodeStart, targetNodeType, {
                            class: ScreenplayElement.Note,
                        });

                        // Remove the [[ prefix
                        tr.delete(nodeStart + 1, nodeStart + 3);

                        return tr;
                    }

                    // Check for uppercase text (automatic character detection)
                    // Only trigger on Enter/newline or when the line is complete
                    // We detect this by checking if the last transaction was a text input
                    const lastTransaction = transactions[transactions.length - 1];
                    const isTextInput = lastTransaction?.steps.some(
                        (step: Step) => step instanceof ReplaceStep && step.slice.content.firstChild?.text !== undefined,
                    );

                    // Only convert to character if:
                    // 1. Text is all uppercase
                    // 2. Current element is action (default element)
                    // 3. Line has meaningful content (not just spaces)
                    // 4. User just typed a space after an uppercase word (natural break point)
                    if (
                        isTextInput &&
                        isAllUppercase(text) &&
                        currentElementType === ScreenplayElement.Action &&
                        text.trim().length >= 2 &&
                        text.endsWith(" ")
                    ) {
                        const nodeStart = $from.before();

                        // Get the target node type from the schema
                        const targetNodeType = newState.schema.nodes[ScreenplayElement.Character];
                        if (!targetNodeType) return null;

                        const tr = newState.tr;
                        tr.setNodeMarkup(nodeStart, targetNodeType, {
                            class: ScreenplayElement.Character,
                        });

                        return tr;
                    }

                    return null;
                },
            }),
        ];
    },
});
