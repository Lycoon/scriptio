import Paragraph from "@tiptap/extension-paragraph";

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
