import { Node, mergeAttributes } from "@tiptap/core";
import { ScreenplayElement } from "../../utils/enums";

export interface TransitionNodeOptions {
    HTMLAttributes: Record<string, any>;
}

export const TransitionNode = Node.create<TransitionNodeOptions>({
    name: ScreenplayElement.Transition,
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
                default: ScreenplayElement.Transition,
                parseHTML: (element) => element.getAttribute("class") || ScreenplayElement.Transition,
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
                    if (classAttr === ScreenplayElement.Transition) {
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
