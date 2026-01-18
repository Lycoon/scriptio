import { Node, mergeAttributes } from "@tiptap/core";
import { ScreenplayElement } from "../../utils/enums";

export interface ParentheticalNodeOptions {
    HTMLAttributes: Record<string, any>;
}

export const ParentheticalNode = Node.create<ParentheticalNodeOptions>({
    name: ScreenplayElement.Parenthetical,
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
                default: ScreenplayElement.Parenthetical,
                parseHTML: (element) => element.getAttribute("class") || ScreenplayElement.Parenthetical,
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
                    if (classAttr === ScreenplayElement.Parenthetical) {
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
