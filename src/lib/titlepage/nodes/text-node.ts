import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Single block node for the title page editor.
 * All lines are this node type. Format marks (Title, Author, Date)
 * are applied as inline marks on the text content within.
 * Text alignment is stored as a CSS class for PDF export compatibility.
 */

const ALIGN_CLASSES: Record<string, string> = {
    left: "tp-align-left",
    center: "tp-align-center",
    right: "tp-align-right",
};

export const TitlePageTextNode = Node.create({
    name: "tp-text",
    group: "block",
    content: "inline*",
    defining: true,
    draggable: false,

    addAttributes() {
        return {
            textAlign: {
                default: "left",
                parseHTML: (element: HTMLElement) => {
                    if (element.classList.contains("tp-align-center")) return "center";
                    if (element.classList.contains("tp-align-right")) return "right";
                    return "left";
                },
                renderHTML: (attributes: Record<string, any>) => {
                    const cls = ALIGN_CLASSES[attributes.textAlign] || ALIGN_CLASSES.left;
                    return { class: cls };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: "p",
                getAttrs: (element) => {
                    const el = element as HTMLElement;
                    // Accept any <p> with tp-align-* class or plain <p> for backward compat
                    const hasAlign = el.classList.contains("tp-align-left")
                        || el.classList.contains("tp-align-center")
                        || el.classList.contains("tp-align-right");
                    // Also accept old title page node classes for backward compat
                    const hasOldClass = el.classList.contains("tp-title")
                        || el.classList.contains("tp-author")
                        || el.classList.contains("tp-date")
                        || el.classList.contains("tp-other")
                        || el.classList.contains("tp-contact");
                    if (hasAlign || hasOldClass) return {};
                    return false;
                },
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["p", mergeAttributes(HTMLAttributes), 0];
    },
});
