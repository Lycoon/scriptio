import Paragraph from "@tiptap/extension-paragraph";

export const Screenplay = Paragraph.extend({
  name: "Screenplay",
  group: "block",
  content: "text*",

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
