import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEditorState } from "../context/AppContext";

import { Action } from "./extensions/Action";
import { Character } from "./extensions/Character";
import { Dialogue } from "./extensions/Dialogue";
import { Parenthetical } from "./extensions/Parenthetical";
import { SceneHeading } from "./extensions/SceneHeading";
import { Transition } from "./extensions/Transition";

const EditorComponent = () => {
  const editorView = useEditor({
    extensions: [
      StarterKit,
      SceneHeading,
      Action,
      Character,
      Dialogue,
      Parenthetical,
      Transition,
    ],
    content: "<p>Ceci est un test, un test, un test</p>",
    autofocus: "end",
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
