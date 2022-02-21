import { useEditor, EditorContent } from "@tiptap/react";
import { Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { useEditorState } from "../context/AppContext";

const EditorComponent = () => {
  const SceneHeading = Node.create({
    name: "sceneHeading",
  });

  const editorView = useEditor({
    extensions: [StarterKit, SceneHeading],
    content: "<p>I’m running Tiptap with Vue.js. 🎉</p>",
  });

  const { editor, updateEditor } = useEditorState();
  updateEditor(editorView!);

  return (
    <div id="editor">
      <EditorContent editor={editorView} />
    </div>
  );
};

export default EditorComponent;
