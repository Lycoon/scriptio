/**
 * Screenplay Extensions
 *
 * This file exports all screenplay-related TipTap extensions:
 * - Node extensions for each screenplay element type
 * - Mark extensions for text formatting (bold, italic, underline)
 */

import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Underline from "@tiptap/extension-underline";

/**
 * Custom Bold mark using class-based styling.
 */
export const ScriptioBold = Bold.extend({
    addAttributes() {
        return {
            class: {
                default: "bold",
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: "span",
                preserveWhitespace: "full",
                getAttrs: (e: any) => {
                    return e.getAttribute("class") === "bold" && null;
                },
            },
            { tag: "strong" },
            { tag: "b" },
        ];
    },

    renderHTML({ HTMLAttributes }: any) {
        return ["span", HTMLAttributes, 0];
    },
});

/**
 * Custom Italic mark using class-based styling.
 */
export const ScriptioItalic = Italic.extend({
    addAttributes() {
        return {
            class: {
                default: "italic",
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: "span",
                preserveWhitespace: "full",
                getAttrs: (e: any) => {
                    return e.getAttribute("class") === "italic" && null;
                },
            },
            { tag: "italic" },
            { tag: "i" },
        ];
    },

    renderHTML({ HTMLAttributes }: any) {
        return ["span", HTMLAttributes, 0];
    },
});

/**
 * Custom Underline mark using class-based styling.
 */
export const ScriptioUnderline = Underline.extend({
    addAttributes() {
        return {
            class: {
                default: "underline",
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: "span",
                preserveWhitespace: "full",
                getAttrs: (e: any) => {
                    return e.getAttribute("class") === "underline" && null;
                },
            },
            { tag: "underline" },
            { tag: "u" },
        ];
    },

    renderHTML({ HTMLAttributes }: any) {
        return ["span", HTMLAttributes, 0];
    },
});
