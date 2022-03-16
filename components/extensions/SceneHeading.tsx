import { Node } from "@tiptap/core";
import { mergeAttributes } from "@tiptap/react";
import EditorSidebar from "../EditorSidebar";

export const SceneHeading = Node.create({
  name: "SceneHeading",
  draggable: false,
  group: "block",
  content: "inline*",

  addOptions() {
    return {
      HTMLAttributes: {
        class: "sceneheader",
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
