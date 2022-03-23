import { TDocumentDefinitions } from "pdfmake/interfaces";
import * as pdfMake from "pdfmake/build/pdfmake";
import { JSONContent } from "@tiptap/react";

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
        margin: [170, 0, 0, 0],
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

/**
 * Export editor JSON screenplay to .pdf format
 * @param title screenplay title
 * @param author screenplay author
 * @param json editor content JSON
 */
export const exportToPDF = async (
  title: string,
  author: string,
  json: JSONContent
) => {
  let nodes = json.content!;
  let pdfNodes = [];

  for (let i = 0; i < nodes.length; i++) {
    const type: string = nodes[i]["attrs"]!["class"];
    const text: string = nodes[i]["content"]![0]["text"]!;
    const nextType: any =
      i >= nodes.length - 1 ? undefined : nodes[i + 1]["attrs"]!["class"];

    switch (type) {
      case "scene":
        pdfNodes.push(getPDFSceneTemplate(text.toUpperCase()));
        break;
      case "character":
        pdfNodes.push(getPDFNodeTemplate("character", text.toUpperCase()));
        break;
      case "dialogue":
        pdfNodes.push(getPDFNodeTemplate("dialogue", text));
        break;
      case "parenthetical":
        pdfNodes.push(getPDFNodeTemplate("parenthetical", "(" + text + ")"));
        break;
      case "transition":
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
};
