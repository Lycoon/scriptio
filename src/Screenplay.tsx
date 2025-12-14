import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Underline from "@tiptap/extension-underline";
import { Node } from "@tiptap/core";

export const Screenplay = Node.create({
    name: "Screenplay",
    group: "block",
    content: "text*",

    defining: true,
    draggable: false,

    addAttributes() {
        return {
            class: {
                default: "action",
                parseHTML: (element) => element.getAttribute("class"),
            },
        };
    },

    renderHTML({ HTMLAttributes }) {
        return ["p", HTMLAttributes, 0];
    },
});

export const CustomBold = Bold.extend({
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
        ];
    },

    renderHTML({ HTMLAttributes }: any) {
        return ["span", HTMLAttributes, 0];
    },
});

export const CustomItalic = Italic.extend({
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
        ];
    },

    renderHTML({ HTMLAttributes }: any) {
        return ["span", HTMLAttributes, 0];
    },
});

export const CustomUnderline = Underline.extend({
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
        ];
    },

    renderHTML({ HTMLAttributes }: any) {
        return ["span", HTMLAttributes, 0];
    },
});
