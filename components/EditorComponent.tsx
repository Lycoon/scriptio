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
import { Screenplay } from "./extensions/Screenplay";

const EditorComponent = ({ setActiveTab }: any) => {
  const editorView = useEditor({
    extensions: [
      // default
      Document,
      Text,
      History,

      // scriptio
      Screenplay,
    ],

    content: '<p class="character">Ceci est un test, un test, un test</p>',
    autofocus: "end",
  });

  editorView?.setOptions({
    editorProps: {
      handleKeyDown(view: any, event: any) {
        const currNode = view.state.selection.$anchor.parent.attrs.class;
        if (event.key === "Enter") {
          let timeout = setTimeout(() => setActiveTab("action"), 20);
          if (currNode === "character" || currNode === "parenthetical") {
            clearTimeout(timeout);
            setTimeout(() => setActiveTab("dialogue"), 20);
          }
        } else if (event.key === "Backspace") {
          setActiveTab(currNode);
        }

        return false;
      },

      handleClickOn(
        view: any,
        pos: number,
        node: any,
        nodePos: number,
        event: MouseEvent,
        direct: boolean
      ) {
        setActiveTab(node.attrs.class);

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
