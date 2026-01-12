import { Screenplay } from "../../utils/types";
import { BaseExportOptions, ScreenplayAdapter } from "../screenplay-adapter";

import fountain from "./fountain_parser";
import { generateJSON } from "@tiptap/react";
import { getNodeFlattenContent } from "@src/lib/screenplay/screenplay";
import { BASE_EXTENSIONS } from "@src/lib/screenplay/editor";

export class FountainAdapter extends ScreenplayAdapter {
    label = "Fountain Script";
    extension = "fountain";

    convertTo(screenplay: Screenplay, options: BaseExportOptions): Promise<Blob> {
        let fountain = "";
        let sceneCount = 1;
        let nodes = screenplay.content!;
        const characters = options.characters;

        for (let i = 0; i < nodes.length; i++) {
            if (!nodes[i]["content"]) continue;

            const content = nodes[i].content!;
            const flatText: string = getNodeFlattenContent(content);
            const type: string = nodes[i].attrs?.class;
            const nextType: string = i >= nodes.length - 1 ? undefined : nodes[i + 1].attrs?.class;

            if (type === "note" && !options.includeNotes) continue;
            if (type === "character" && characters && !characters.includes(flatText)) {
                // Don't export unselected characters
                let j = i + 1;
                for (; j < nodes.length; j++) {
                    const typeJ: string = nodes[j]["attrs"]!["class"];
                    if (typeJ === "dialogue" || typeJ === "parenthetical") {
                        continue;
                    }

                    break;
                }
                i = j - 1;
                continue;
            }

            // Handle styled text fragments
            let fullText: string = "";
            for (let j = 0; j < content.length; j++) {
                const styles: string[] = Object.values(content[j].marks ?? []);
                const childNode = content[j];
                let textFragment: string = "text" in childNode ? childNode.text : "";

                if (styles.includes("bold")) textFragment = "**" + textFragment + "**";
                if (styles.includes("italic")) textFragment = "*" + textFragment + "*";
                if (styles.includes("underline")) textFragment = "_" + textFragment + "_";

                fullText += textFragment;
            }

            switch (type) {
                case "scene":
                    fountain += "\n." + fullText.toUpperCase() + " #" + sceneCount + ".#";
                    fountain += nextType === "character" ? "" : "\n";
                    sceneCount++;
                    break;
                case "action":
                    fountain += "!" + fullText;
                    fountain += nextType === "character" ? "" : "\n";
                    break;
                case "character":
                    fountain += "\n@" + fullText;
                    break;
                case "transition":
                    fountain += "\n>" + fullText.toUpperCase() + ":\n";
                    break;
                case "parenthetical":
                    fountain += "(" + fullText + ")";
                    break;
                case "section":
                    fountain += "# " + fullText;
                    break;
                case "dialogue":
                    fountain += fullText;
                    fountain += nextType === "action" ? "\n" : "";
                    break;
                case "note":
                    fountain += "\n[[" + fullText + "]]";
                    break;
                default:
                    fountain += fullText;
            }

            fountain += "\n";
        }
        const blob = new Blob([fountain], { type: "text/plain;charset=utf-8" });
        return Promise.resolve(blob);
    }

    convertFrom(rawContent: string): Screenplay {
        const output = fountain.parse(rawContent, true);
        const html = output["html"]["script"];
        const json = generateJSON(html, BASE_EXTENSIONS) as Screenplay;
        return json;
    }
}
