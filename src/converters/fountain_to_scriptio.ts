import { Editor } from "@tiptap/react";
import fountain from "./fountain";

export const convertFountainToJSON = async (text: string, editor: Editor) => {
  const nodes: any[] = [];
  fountain.parse(text, true, function (output: any) {
    const tokens = output["tokens"];
    for (let i = 0; i < tokens.length; i++) {
      const type: string = tokens[i]["type"];
      const text: string = tokens[i]["text"];

      switch (type) {
        case "action":
          break;
      }
    }

    const html = output["html"]["script"];
    editor?.commands.setContent(
      '<p class="scene">INT. MAISON DE HUGO - JOUR</p>'
    );
  });
};
