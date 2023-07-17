import { ExportData } from "@components/projects/export/ExportProjectContainer";
import { getNodeFlattenContent } from "@src/lib/screenplay";

/**
 * Convert editor JSON screenplay to .fountain format
 * @param json editor content JSON
 * @returns .fountain format screenplay
 */
export const convertToFountain = (json: any, exportData: ExportData): string => {
    let fountain = "";
    let sceneCount = 1;
    let nodes = json.content!;
    const characters = exportData.characters;

    for (let i = 0; i < nodes.length; i++) {
        if (!nodes[i]["content"]) {
            continue;
        }

        const content = nodes[i]["content"];
        const flatText: string = getNodeFlattenContent(nodes[i]);
        const type: string = nodes[i]["attrs"]["class"];
        const nextType: string = i >= nodes.length - 1 ? undefined : nodes[i + 1]["attrs"]["class"];

        if (type === "note" && !exportData.notes) continue;
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
            const styles: string[] = Object.values(content[j]["marks"] ?? []);
            let textFragment: string = content[j]["text"];

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

    return fountain;
};
