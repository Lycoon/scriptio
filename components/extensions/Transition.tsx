import Paragraph from "@tiptap/extension-paragraph";

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
