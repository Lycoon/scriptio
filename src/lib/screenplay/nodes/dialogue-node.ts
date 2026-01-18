import { Node, mergeAttributes } from "@tiptap/core";
import { ScreenplayElement } from "../../utils/enums";

export interface DialogueNodeOptions {
    HTMLAttributes: Record<string, any>;
}

export const DialogueNode = Node.create<DialogueNodeOptions>({
    name: ScreenplayElement.Dialogue,
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
                default: ScreenplayElement.Dialogue,
                parseHTML: (element) => element.getAttribute("class") || ScreenplayElement.Dialogue,
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: "p",
                getAttrs: (element) => {
                    const el = element as HTMLElement;
                    const classAttr = el.getAttribute("class");
                    if (classAttr === ScreenplayElement.Dialogue) {
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
