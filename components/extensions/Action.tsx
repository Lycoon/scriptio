import { Node } from "@tiptap/core";
import { mergeAttributes } from "@tiptap/react";

export const Action = Node.create({
  name: "Action",
  draggable: false,
  group: "block",
  content: "inline*",
  priority: 1500,

  addOptions() {
    return {
      HTMLAttributes: {
        class: "action",
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "p",
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
