import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import Paragraph from "@tiptap/extension-paragraph";
import History from "@tiptap/extension-history";

import { useEditor, EditorContent } from "@tiptap/react";
import { useEffect, useState } from "react";
import { useEditorState } from "../context/AppContext";

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

    onTransaction({ editor, transaction }) {
      if (transaction.steps.length !== 0) {
        const currNode = editor.view.state.selection.$anchor.parent.attrs.class;
        setActiveTab(currNode);
      }
    },

    content: '<p class="action">Ceci est un test, un test, un test</p>',
    autofocus: "end",
  });

  editorView?.setOptions({
    editorProps: {
      handleKeyDown(view: any, event: any) {
        const currNode = view.state.selection.$anchor.parent.attrs.class;
        if (event.key === "Enter") {
          setTimeout(() => setActiveTab("action"), 20);
          if (currNode === "character" || currNode === "parenthetical") {
            clearTimeout();
            setTimeout(() => setActiveTab("dialogue"), 20);
          } else if (currNode === "dialogue") {
            clearTimeout();
            setTimeout(() => setActiveTab("character"), 20);
          }
        }

        return false;
      },

      handleClickOn(view: any, pos: number, node: any) {
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
