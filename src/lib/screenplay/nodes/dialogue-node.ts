import { Node, mergeAttributes } from "@tiptap/core";
import { ScreenplayElement } from "../../utils/enums";
import { ALIGN_CLASSES, generateNodeId } from "./index";

export interface DialogueNodeOptions {
    HTMLAttributes: Record<string, unknown>;
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
            "data-id": {
                default: () => generateNodeId(),
                parseHTML: (element) => element.getAttribute("data-id") || null,
                renderHTML: (attributes) => attributes["data-id"] ? { "data-id": attributes["data-id"] } : {},
            },
            class: {
                default: ScreenplayElement.Dialogue,
                parseHTML: (element) => element.getAttribute("class")?.split(" ")[0] || ScreenplayElement.Dialogue,
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
                    if (el.classList.contains(ScreenplayElement.Dialogue)) {
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
