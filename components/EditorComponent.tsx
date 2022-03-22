import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import Paragraph from "@tiptap/extension-paragraph";
import History from "@tiptap/extension-history";

import { useEditor, EditorContent } from "@tiptap/react";
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
      // default
      Document,
      Text,
      Paragraph,
      History,

      // scriptio
      Scene,
      Action,
      Character,
      Dialogue,
      Parenthetical,
      Transition,
    ],

    content: '<p class="character">Ceci est un test, un test, un test</p>',
    autofocus: "end",
  });

  editorView?.setOptions({
    editorProps: {
      handleKeyDown(view: any, event: any) {
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

      handleClick(view: any) {
        const currNode = view.state.selection.$anchor.parent.type.name;
        //setActiveTab(currNode);

        console.log(view.state["doc"]["content"]["content"]);

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
