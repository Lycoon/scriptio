import { Node, mergeAttributes } from "@tiptap/core";
import { ScreenplayElement } from "../../utils/enums";

export interface SectionNodeOptions {
    HTMLAttributes: Record<string, any>;
}

export const SectionNode = Node.create<SectionNodeOptions>({
    name: ScreenplayElement.Section,
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
                default: ScreenplayElement.Section,
                parseHTML: (element) => element.getAttribute("class") || ScreenplayElement.Section,
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
                    if (classAttr === ScreenplayElement.Section) {
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
