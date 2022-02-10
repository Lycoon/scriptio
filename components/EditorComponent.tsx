import { useEditor, EditorContent } from "@tiptap/react";
import { Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

const EditorComponent = () => {
  const SceneHeading = Node.create({
    name: "sceneHeading",
  });

  const editor = useEditor({
    extensions: [StarterKit, SceneHeading],
    content: "<p>I’m running Tiptap with Vue.js. 🎉</p>",
  });

  return (
    <div id="editor">
      <EditorContent editor={editor} />
    </div>
  );
};

export default EditorComponent;
