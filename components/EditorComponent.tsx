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
    editorProps: {
      handleKeyDown(view, event) {
        if (event.key === "Enter") {
          const currNode = view.state.selection.$anchor.parent.type.name;
          console.log("currNodeEnter: " + currNode);

          if (currNode === "Character" || currNode === "Parenthetical") {
            // setActiveTab("Dialogue")
          }
        }

        return false;
      },

      handleClick(view, pos, event) {
        const currNode = view.state.selection.$anchor.parent.type.name;
        console.log("currNode: " + currNode);

        // setActiveTab(currNode)

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
