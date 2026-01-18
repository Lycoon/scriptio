import { Node, mergeAttributes } from "@tiptap/core";
import { ScreenplayElement } from "../../utils/enums";

export interface CharacterNodeOptions {
    HTMLAttributes: Record<string, any>;
}

export const CharacterNode = Node.create<CharacterNodeOptions>({
    name: ScreenplayElement.Character,
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
                default: ScreenplayElement.Character,
                parseHTML: (element) => element.getAttribute("class") || ScreenplayElement.Character,
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
                    if (classAttr === ScreenplayElement.Character) {
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
