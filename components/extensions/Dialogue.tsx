import { Node } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";
import { mergeAttributes } from "@tiptap/react";

export const Dialogue = Paragraph.extend({
  name: "Dialogue",
  draggable: false,
  group: "block",
  content: "inline*",

  addAttributes() {
    return {
      class: {
        default: "dialogue",
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
        class: "dialogue",
      },
    ];
  },
});
