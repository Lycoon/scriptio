import Paragraph from "@tiptap/extension-paragraph";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Underline from "@tiptap/extension-underline";
import { Node, NodeViewRenderer } from "@tiptap/react";
import Document from "@tiptap/extension-document";

export const Screenplay = Document.extend({
    name: "screenplay",
    content: "page+",
    group: "block",

    parseHTML() {
        return [{ tag: "div.screenplay" }];
    },
    renderHTML() {
        return ["div", { class: "screenplay" }, 0];
    },
});

export const Page = Node.create({
    name: "page",
    content: "element+",
    group: "block",

    addNodeView(): NodeViewRenderer {
        return ({ editor, node, getPos }) => {
            const wrapper = document.createElement("div");
            wrapper.classList.add("page");

            const content = document.createElement("div");
            content.classList.add("content");
            wrapper.append(content);

            return { wrapper };
        };
    },
    parseHTML() {
        return [{ tag: "div.page" }];
    },
    renderHTML() {
        return ["div", { class: "page" }, 0];
    },
});

export const ScriptElement = Paragraph.extend({
    name: "element",
    content: "text*",
    group: "block",

    addAttributes() {
        return {
            class: {
                default: "action",
            },
        };
    },

    parseHTML() {
        return [
            {
                getAttrs(node) {
                    const dom = node as HTMLElement;
                    return { class: dom.getAttribute("class") };
                },
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["p", HTMLAttributes, 0];
    },
});

export const CustomBold = Bold.extend({
    parseHTML() {
        return [{ tag: "span.bold" }];
    },
    renderHTML() {
        return ["span", { class: "bold" }, 0];
    },
});

export const CustomItalic = Italic.extend({
    parseHTML() {
        return [{ tag: "span.italic" }];
    },
    renderHTML() {
        return ["span", { class: "italic" }, 0];
    },
});

export const CustomUnderline = Underline.extend({
    parseHTML() {
        return [{ tag: "span.underline" }];
    },
    renderHTML() {
        return ["span", { class: "underline" }, 0];
    },
});
