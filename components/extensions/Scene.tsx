import { Node } from "@tiptap/react";
import { mergeAttributes } from "@tiptap/react";

export const Scene = Node.create({
  name: "Scene",
  draggable: false,
  group: "block",
  content: "inline*",

  addOptions() {
    return {
      HTMLAttributes: {
        class: "scene",
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      setHeading:
        (attributes) =>
        ({ commands }) => {
          return commands.setNode(this.name, attributes);
        },
      toggleHeading:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleNode(this.name, this.name, attributes);
        },
    };
  },
});
