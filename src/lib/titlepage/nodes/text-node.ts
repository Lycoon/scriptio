import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Single block node for the title page editor.
 * All lines are this node type. Format marks (Title, Author, Date)
 * are applied as inline marks on the text content within.
 * Text alignment is stored as a CSS class for PDF export compatibility.
 */

const ALIGN_CLASSES: Record<string, string> = {
    left: "align-left",
    center: "align-center",
    right: "align-right",
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
                    if (element.classList.contains("align-center")) return "center";
                    if (element.classList.contains("align-right")) return "right";
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
                    const hasAlign =
                        el.classList.contains("align-left") ||
                        el.classList.contains("align-center") ||
                        el.classList.contains("align-right");
                    if (hasAlign) return {};
                    return false;
                },
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["p", mergeAttributes(HTMLAttributes), 0];
    },
});
