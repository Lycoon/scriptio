import Paragraph from "@tiptap/extension-paragraph";

export const Screenplay = Paragraph.extend({
  name: "Screenplay",
  draggable: false,
  group: "block",
  content: "inline*",

  addAttributes() {
    return {
      class: {
        default: "action",
        parseHTML: (element) => element.getAttribute("class"),
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ["p", HTMLAttributes, 0];
  },
});
