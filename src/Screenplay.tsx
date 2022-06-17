import Paragraph from "@tiptap/extension-paragraph";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";

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

export const CustomBold = Bold.extend({
  addAttributes() {
    return {
      class: {
        default: "bold",
        parseHTML: (element) => element.getAttribute("class"),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span",
        attrs: ["bold"],
        preserveWhitespace: "full",
      },
    ];
  },

  renderHTML({ HTMLAttributes }: any) {
    return ["span", HTMLAttributes, 0];
  },
});

export const CustomItalic = Italic.extend({
  addAttributes() {
    return {
      class: {
        default: "italic",
        parseHTML: (element: Element) => element.getAttribute("class"),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span",
        attrs: ["italic"],
        preserveWhitespace: "full",
      },
    ];
  },

  renderHTML({ HTMLAttributes }: any) {
    return ["span", HTMLAttributes, 0];
  },
});
