import { Node, mergeAttributes } from "@tiptap/core";
import { ScreenplayElement } from "../../utils/enums";
import { ALIGN_CLASSES } from "./index";

export interface SceneNodeOptions {
    HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        sceneNode: {
            /**
             * Set the scene-id attribute on the current scene node
             */
            setSceneId: (sceneId: string) => ReturnType;
            /**
             * Remove the scene-id attribute from the current scene node
             */
            removeSceneId: () => ReturnType;
        };
    }
}

/**
 * Scene heading node with support for persistent scene-id attribute.
 *
 * The scene-id attribute is used to link a scene heading to persistent
 * scene data (synopsis, color) stored in the Yjs document.
 *
 * When a scene is edited (given a synopsis or color), it becomes "persistent"
 * and the scene heading gets a unique scene-id attribute.
 */
export const SceneNode = Node.create<SceneNodeOptions>({
    name: ScreenplayElement.Scene,
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
                default: ScreenplayElement.Scene,
                parseHTML: (element) => element.getAttribute("class")?.split(" ")[0] || ScreenplayElement.Scene,
            },
            "scene-id": {
                default: null,
                // Do NOT preserve scene-id on split — the split-off node should
                // be a fresh scene heading without persistent data linkage.
                keepOnSplit: false,
                parseHTML: (element) => element.getAttribute("scene-id") || element.getAttribute("data-scene-id"),
                renderHTML: (attributes) => {
                    if (!attributes["scene-id"]) {
                        return {};
                    }
                    return { "scene-id": attributes["scene-id"] };
                },
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
                    if (el.classList.contains(ScreenplayElement.Scene)) {
                        return {
                            "scene-id": el.getAttribute("scene-id") || el.getAttribute("data-scene-id") || null,
                        };
                    }
                    return false;
                },
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["p", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
    },

    addCommands() {
        return {
            setSceneId:
                (sceneId: string) =>
                ({ commands }) => {
                    return commands.updateAttributes(this.name, { "scene-id": sceneId });
                },
            removeSceneId:
                () =>
                ({ commands }) => {
                    return commands.updateAttributes(this.name, { "scene-id": null });
                },
        };
    },
});
