import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import { useEditorState } from "../context/AppContext";

import { Action } from "./extensions/Action";
import { Character } from "./extensions/Character";
import { Dialogue } from "./extensions/Dialogue";
import { Parenthetical } from "./extensions/Parenthetical";
import { Scene } from "./extensions/Scene";
import { Transition } from "./extensions/Transition";

const EditorComponent = ({ setActiveTab }: any) => {
  const editorView = useEditor({
    extensions: [
      StarterKit,
      Scene,
      Action,
      Character,
      Dialogue,
      Parenthetical,
      Transition,
    ],

    content: "Ceci est un test, un test, un test",
    autofocus: "end",
  });

  editorView?.setOptions({
    editorProps: {
      handleKeyDown(view, event) {
        if (event.key === "Enter") {
          const currNode = view.state.selection.$anchor.parent.type.name;

          let timeout = setTimeout(() => setActiveTab("Action"), 20);
          if (currNode === "Character" || currNode === "Parenthetical") {
            clearTimeout(timeout);
            setTimeout(() => setActiveTab("Dialogue"), 20);
          }
        }

        return false;
      },

      handleClick(view, pos, event) {
        const currNode = view.state.selection.$anchor.parent.type.name;

        setActiveTab(currNode);
        console.log(editorView.getHTML());

        return false;
      },
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
