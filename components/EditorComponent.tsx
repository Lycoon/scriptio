import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
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
    content: "Ceci est un test, un test, un test",
    autofocus: "end",
    onTransaction: (editor) => {
      // console.log(editor.editor.state.selection.anchor);
      const caret = editor.editor.state.selection.head;
      const tmp: HTMLElement = editor.editor.view.domAtPos(caret).node
        .parentNode! as any;
      console.log(tmp.lastElementChild?.getAttribute("class"));
    },
  });

  const { editor, updateEditor } = useEditorState();

  useEffect(() => {
    updateEditor(editorView!);
  });

  return (
    <div id="editor">
      <EditorContent editor={editorView} />
    </div>
  );
};

export default EditorComponent;
