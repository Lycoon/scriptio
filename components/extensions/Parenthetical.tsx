import { Node } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";
import { mergeAttributes } from "@tiptap/react";

export const Parenthetical = Paragraph.extend({
  name: "Parenthetical",
  draggable: false,
  group: "block",
  content: "inline*",

  addAttributes() {
    return {
      class: {
        default: "parenthetical",
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
        class: "parenthetical",
      },
    ];
  },
});
