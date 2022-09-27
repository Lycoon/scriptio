import { ExportData } from "../../components/projects/export/ExportProjectContainer";

/**
 * Convert editor JSON screenplay to .fountain format
 * @param json editor content JSON
 * @returns .fountain format screenplay
 */
export const convertJSONtoFountain = (
    json: any,
    exportData: ExportData
): string => {
    let fountain = "";
    let sceneCount = 1;
    let nodes = json.content!;
    const characters = exportData.characters;

    for (let i = 0; i < nodes.length; i++) {
        if (!nodes[i]["content"]) {
            continue;
        }

        const text: string = nodes[i]["content"][0]["text"];
        const type: string = nodes[i]["attrs"]["class"];
        const nextType: string =
            i >= nodes.length - 1 ? undefined : nodes[i + 1]["attrs"]["class"];

        // Don't export unselected characters
        if (type === "character" && characters && !characters.includes(text)) {
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

        switch (type) {
            case "scene":
                fountain += "." + text.toUpperCase() + " #" + sceneCount + ".#";
                fountain += nextType === "character" ? "" : "\n";
                sceneCount++;
                break;
            case "action":
                fountain += "!" + text;
                fountain += nextType === "character" ? "" : "\n";
                break;
            case "character":
                fountain += "\n@" + text;
                break;
            case "transition":
                fountain += "\n>" + text.toUpperCase() + ":\n";
                break;
            case "parenthetical":
                fountain += "(" + text + ")";
                break;
            case "section":
                fountain += "# " + text;
                break;
            case "dialogue":
                fountain += text;
                fountain += nextType === "action" ? "\n" : "";
                break;
            case "note":
                if (exportData.notes) {
                    fountain += "\n[[" + text + "]]";
                }
                break;
            default:
                fountain += text;
        }

        fountain += "\n";
    }

    return fountain;
};
