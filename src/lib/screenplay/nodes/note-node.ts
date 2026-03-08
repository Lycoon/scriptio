import { Node, mergeAttributes } from "@tiptap/core";
import { ScreenplayElement } from "../../utils/enums";
import { ALIGN_CLASSES } from "./index";

export interface NoteNodeOptions {
    HTMLAttributes: Record<string, any>;
}

export const NoteNode = Node.create<NoteNodeOptions>({
    name: ScreenplayElement.Note,
    group: "block",
    content: "text*",
    defining: true,
    draggable: false,

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            class: {
                default: ScreenplayElement.Note,
                parseHTML: (element) => element.getAttribute("class")?.split(" ")[0] || ScreenplayElement.Note,
            },
            textAlign: {
                default: null,
                parseHTML: (element) => {
                    if (element.classList.contains("align-center")) return "center";
                    if (element.classList.contains("align-right")) return "right";
                    return null;
                },
                renderHTML: (attributes) => {
                    if (!attributes.textAlign) return {};
                    const cls = ALIGN_CLASSES[attributes.textAlign];
                    return cls ? { class: cls } : {};
                },
            },
            height: {
                default: null,
                renderHTML: (attributes) => attributes.height != null ? { "data-height": attributes.height } : {},
                parseHTML: (element) => {
                    const v = element.getAttribute("data-height");
                    return v !== null ? parseInt(v, 10) : null;
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
                    if (el.classList.contains(ScreenplayElement.Note)) {
                        return {};
                    }
                    return false;
                },
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["p", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
    },
});
