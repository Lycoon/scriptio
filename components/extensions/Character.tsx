import { Node } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";
import { mergeAttributes } from "@tiptap/react";

export const Character = Paragraph.extend({
  name: "Character",
  draggable: false,
  group: "block",
  content: "inline*",

  addAttributes() {
    return {
      class: {
        default: "character",
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
        class: "character",
      },
    ];
  },
});
