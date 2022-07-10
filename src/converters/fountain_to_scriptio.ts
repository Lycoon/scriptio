import { Editor } from "@tiptap/react";
import fountain from "./fountain";

/**
 * Convert .fountain format screenplay to editor JSON
 * @param text .fountain format screenplay
 * @param editor main editor
 */
export const convertFountainToJSON = async (text: string, editor: Editor) => {
    fountain.parse(text, true, function (output: any) {
        const html = output["html"]["script"];
        editor?.commands.setContent(html);
    });
};
