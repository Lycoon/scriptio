import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";

import { useEditor, EditorContent } from "@tiptap/react";
import { useContext, useEffect, useState } from "react";

import { Screenplay } from "../../src/Screenplay";
import { UserContext } from "../../src/context/UserContext";

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

    // update active on caret update
    onSelectionUpdate({ editor, transaction }) {
      const currNode = transaction.curSelection.$anchor.path[3].attrs.class;
      setActiveTab(currNode);
    },

    content: '<p class="action">Ceci est un test, un test, un test</p>',
    autofocus: "end",
  });

  editorView?.setOptions({
    editorProps: {
      handleKeyDown(view: any, event: any) {
        const node = view.state.selection.$anchor.parent;
        const currNode = node.attrs.class;
        if (event.key === "Enter") {
          setTimeout(() => setActiveTab("action"), 20);
          console.log(node.content.size);
          if (currNode === "character" || currNode === "parenthetical") {
            clearTimeout();
            setTimeout(() => setActiveTab("dialogue"), 20);
          }
        }

        return false;
      },
    },
  });

  const { editor, updateEditor } = useContext(UserContext);

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
