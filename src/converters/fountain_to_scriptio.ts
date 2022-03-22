import { Editor } from "@tiptap/react";
import fountain from "./fountain";

export const convertFountainToJSON = async (text: string, editor: Editor) => {
  const nodes: any[] = [];
  fountain.parse(text, true, function (output: any) {
    const tokens = output["tokens"];
    for (let i = 0; i < tokens.length; i++) {
      const type: string = tokens[i]["type"];
      const text: string = tokens[i]["text"];
    }

    const html = output["html"]["script"];

    const demo = `<p class="action">This is an action</p><p class="character">This should be a character</p>`;
    editor?.commands.setContent(demo);
  });
};
