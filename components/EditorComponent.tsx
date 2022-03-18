import { useEditor, EditorContent, JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import { useEditorState } from "../context/AppContext";

import { Action } from "./extensions/Action";
import { Character } from "./extensions/Character";
import { Dialogue } from "./extensions/Dialogue";
import { Parenthetical } from "./extensions/Parenthetical";
import { Scene } from "./extensions/Scene";
import { Transition } from "./extensions/Transition";

import { jsPDF } from "jspdf";

const EditorComponent = ({ setActiveTab }: any) => {
  function exportToPDF(filename: string, json: JSONContent) {
    const doc = new jsPDF({ unit: "px" });

    doc.setFont("Courier");
    doc.setFontSize(12);
    doc.setTextColor("#363636");
    doc.setCharSpace(5);

    let fountain = "";
    for (let i = 0; i < json.length; i++) {
      const type: string = json[i]["type"];
      const text: string = json[i]["content"][0]["text"];
      const nextType: string =
        i >= json.length - 1 ? undefined : json[i + 1]["type"];

      doc.text(text, 0, i * 2);
      fountain += "\n";
    }

    doc.save(filename + ".pdf");
  }

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
      handleKeyDown(view: any, event: any) {
        if (event.key === "Enter") {
          const currNode = view.state.selection.$anchor.parent.type.name;

          let timeout = setTimeout(() => setActiveTab("Action"), 20);
          if (currNode === "Character" || currNode === "Parenthetical") {
            clearTimeout(timeout);
            setTimeout(() => setActiveTab("Dialogue"), 20);
          }
        } else if (event.key === "$") {
          exportToPDF("screenplay", editor.getJSON());
        }

        return false;
      },

      handleClick(view: any) {
        const currNode = view.state.selection.$anchor.parent.type.name;
        setActiveTab(currNode);

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
