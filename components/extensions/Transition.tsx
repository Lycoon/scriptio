import { Node } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";
import { mergeAttributes } from "@tiptap/react";

export const Transition = Paragraph.extend({
  name: "Transition",
  draggable: false,
  group: "block",
  content: "inline*",

  addAttributes() {
    return {
      class: {
        default: "transition",
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ["p", HTMLAttributes, 0];
  },

  parseHTML() {
    return [
      {
        tag: "p",
        class: "transition",
      },
    ];
  },
});
