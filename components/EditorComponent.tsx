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
import { TDocumentDefinitions } from "pdfmake/interfaces";
import * as pdfMake from "pdfmake/build/pdfmake";

const fonts = {
  CourierPrime: {
    normal: "http://localhost:3000/fonts/Courier%20Prime.ttf",
    bold: "http://localhost:3000/fonts/Courier%20Prime%20Bold.ttf",
    italics: "http://localhost:3000/fonts/Courier%20Prime.ttf",
    bolditalics: "http://localhost:3000/fonts/Courier%20Prime.ttf",
  },
};

const getPDFSceneTemplate = (text: string) => {
  return {
    layout: "noBorders",
    table: {
      widths: ["*"],
      body: [
        [
          {
            text,
            style: ["scene"],
          },
        ],
      ],
    },
  };
};

const getPDFNodeTemplate = (style: string, text: string) => {
  return {
    text,
    style: [style],
  };
};

const initPDF = (
  title: string,
  author: string,
  pdfNodes: any[]
): TDocumentDefinitions => {
  return {
    info: {
      title,
      author,
    },
    content: pdfNodes,
    pageMargins: [105, 70, 70, 70],
    defaultStyle: {
      font: "CourierPrime",
      fontSize: 12,
      alignment: "left",
    },
    styles: {
      scene: {
        bold: true,
        fillColor: "#dadada",
        lineHeight: 0.85,
        margin: [4, 0, 0, 0],
      },
      character: {
        margin: [170, 0],
      },
      dialogue: {
        margin: [100, 0],
      },
      parenthetical: {
        margin: [140, 0],
      },
      transition: {
        alignment: "right",
      },
    },
  };
};

const EditorComponent = ({ setActiveTab }: any) => {
  function exportToPDF(title: string, author: string, json: JSONContent) {
    let nodes = json.content!;
    let pdfNodes = [];

    for (let i = 0; i < nodes.length; i++) {
      const type: string = nodes[i]["type"]!;
      const text: string = nodes[i]["content"]![0]["text"]!;
      const nextType: any =
        i >= nodes.length - 1 ? undefined : nodes[i + 1]["type"];

      switch (type) {
        case "Scene":
          pdfNodes.push(getPDFSceneTemplate(text.toUpperCase()));
          break;
        case "Character":
          pdfNodes.push(getPDFNodeTemplate("character", text.toUpperCase()));
          break;
        case "Dialogue":
          pdfNodes.push(getPDFNodeTemplate("dialogue", text));
          break;
        case "Parenthetical":
          pdfNodes.push(getPDFNodeTemplate("parenthetical", "(" + text + ")"));
          break;
        case "Transition":
          pdfNodes.push(
            getPDFNodeTemplate("transition", text.toUpperCase() + ":")
          );
          break;
        default:
          pdfNodes.push(getPDFNodeTemplate("action", text));
      }
    }

    const pdf = initPDF(title, author, pdfNodes);
    pdfMake.createPdf(pdf, undefined, fonts).open();
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
          exportToPDF("screenplay", "Hugo Bois", editor!.getJSON());
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
