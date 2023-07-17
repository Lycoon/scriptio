import { ExportData } from "@components/projects/export/ExportProjectContainer";
import { getNodeFlattenContent } from "@src/lib/screenplay";
import { capitalizeFirstLetter } from "@src/lib/utils/misc";
import { XMLBuilder } from "fast-xml-parser";

const options = { attributeNamePrefix: "@_", textNodeName: "#text", ignoreAttributes: false, format: true };
const builder = new XMLBuilder(options);

const FDX_ELEMENT_TABLE: Record<string, string> = {
    action: "Action",
    character: "Character",
    dialogue: "Dialogue",
    parenthetical: "Parenthetical",
    scene: "Scene Heading",
    section: "Section Heading",
    transition: "Transition",
    note: "Note",
};

const FDX_STYLE_TABLE: Record<string, string> = {
    bold: "Bold",
    italic: "Italic",
    underline: "Underline",
};

/**
 * Convert editor JSON screenplay to .fdx format
 * @param json editor content JSON
 * @returns .fdx format screenplay
 */
export const convertToFDX = (json: any, exportData: ExportData): string => {
    let paragraphNodes: any = [];
    let nodes = json.content!;
    const characters = exportData.characters;
    debugger;

    for (let i = 0; i < nodes.length; i++) {
        if (!nodes[i]["content"]) {
            continue;
        }

        const content = nodes[i]["content"];
        const flatText: string = getNodeFlattenContent(nodes[i]);
        const type: string = nodes[i]["attrs"]["class"];
        const nextType: string = i >= nodes.length - 1 ? undefined : nodes[i + 1]["attrs"]["class"];

        // Don't export unselected characters
        if (type === "character" && characters && !characters.includes(flatText)) {
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

        let textNodes: any[] = [];
        for (let j = 0; j < content.length; j++) {
            // <Text Style="style">
            const textFragment: string = content[j]["text"];
            const styledNode: any = { "#text": textFragment };

            const styles: string[] = (content[j]["marks"] ?? []).map((mark: any) => FDX_STYLE_TABLE[mark.type]);
            const fdxStyle: string = styles.join("+");
            if (fdxStyle) styledNode["@_Style"] = fdxStyle;

            textNodes.push(styledNode);
        }

        // <Paragraph Type="type">
        const paragraphNode: any = { Text: textNodes };
        paragraphNode["@_Type"] = FDX_ELEMENT_TABLE[type];

        switch (type) {
            case "scene":
                //node.Paragraph.Text["#text"] = text.toUpperCase();
                paragraphNode.SceneProperties = {
                    "@_Length": "1",
                    "@_Page": "1",
                    "@_Title": "",
                };
                break;
            case "section":
            case "character":
                //node.Paragraph.Text["#text"] = text.toUpperCase();
                break;
            case "transition":
                //node.Paragraph.Text["#text"] = text.toUpperCase() + ":";
                break;
            case "parenthetical":
                //node.Paragraph.Text["#text"] = "(" + text + ")";
                break;
        }

        paragraphNodes.push(paragraphNode);
    }

    // <Content>
    const contentNode = { Paragraph: paragraphNodes };
    const xml = builder.build({
        FinalDraft: {
            "@_DocumentType": "Script",
            "@_Template": "No",
            "@_Version": "5.0",
            Content: contentNode,
        },
    });

    return xml;
};
