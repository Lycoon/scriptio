import Paragraph from "@tiptap/extension-paragraph";

export const Action = Paragraph.extend({
  name: "Action",
  draggable: false,
  group: "block",
  content: "inline*",
  priority: 1500,

  addAttributes() {
    return {
      class: {
        default: "action",
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
        class: "action",
      },
    ];
  },
});
