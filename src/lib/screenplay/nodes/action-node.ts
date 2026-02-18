import { Node, mergeAttributes } from "@tiptap/core";
import { ScreenplayElement } from "../../utils/enums";
import { ALIGN_CLASSES } from "./index";

export interface ActionNodeOptions {
    HTMLAttributes: Record<string, any>;
}

export const ActionNode = Node.create<ActionNodeOptions>({
    name: ScreenplayElement.Action,
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
                default: ScreenplayElement.Action,
                parseHTML: (element) => element.getAttribute("class")?.split(" ")[0] || ScreenplayElement.Action,
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
        };
    },

    parseHTML() {
        return [
            {
                tag: "p",
                getAttrs: (element) => {
                    const el = element as HTMLElement;
                    if (el.classList.contains(ScreenplayElement.Action)) {
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
