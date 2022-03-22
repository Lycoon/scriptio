import { Node } from "@tiptap/react";
import { mergeAttributes } from "@tiptap/react";

export const Scene = Node.create({
  name: "Scene",
  draggable: false,
  group: "block",
  content: "inline*",

  addAttributes() {
    return {
      class: {
        default: "scene",
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },

  parseHTML() {
    return [
      {
        tag: "span",
        class: "scene",
      },
    ];
  },
});
