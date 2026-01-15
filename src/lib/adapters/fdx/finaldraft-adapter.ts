import { Screenplay } from "@src/lib/utils/types";
import { BaseExportOptions, ProjectAdapter } from "../screenplay-adapter";
import { XMLBuilder } from "@node_modules/fast-xml-parser/src/fxp";
import { getNodeFlattenContent } from "@src/lib/screenplay/screenplay";
import * as Y from "yjs";
import { ProjectData, ProjectState, YJS_FRAGMENTS } from "@src/lib/project/project-yjs";

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

export class FinalDraftAdapter extends ProjectAdapter<BaseExportOptions> {
    label = "Final Draft";
    extension = "fdx";

    convertTo(project: ProjectState, options: BaseExportOptions): Promise<Blob> {
        let paragraphNodes: any = [];
        let nodes = project.screenplay;
        const characters = options.characters;

        for (let i = 0; i < nodes.length; i++) {
            if (!nodes[i] || !nodes[i].content) continue;

            const content = nodes[i].content!;
            const flatText: string = getNodeFlattenContent(content);
            const type: string = nodes[i].attrs?.class;
            const nextType: string = i >= nodes.length - 1 ? "action" : nodes[i + 1].attrs?.class;

            // Don't export unselected characters
            if (type === "character" && characters && !characters.includes(flatText)) {
                let j = i + 1;
                for (; j < nodes.length; j++) {
                    const typeJ: string = nodes[j].attrs?.class;
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
                const childNode = content[j];
                const textFragment: string = "text" in childNode ? childNode.text! : "";
                const styledNode: any = { "#text": textFragment };

                const styles: string[] = (content[j].marks ?? []).map((mark: any) => FDX_STYLE_TABLE[mark.type]);
                const fdxStyle: string = styles.join("+");
                if (fdxStyle) styledNode["@_Style"] = fdxStyle;

                textNodes.push(styledNode);
            }

            // <Paragraph Type="type">
            const paragraphNode: any = { Text: textNodes };
            paragraphNode["@_Type"] = FDX_ELEMENT_TABLE[type];

            if (type === "scene") {
                paragraphNode.SceneProperties = {
                    "@_Length": "1",
                    "@_Page": "1",
                    "@_Title": "",
                };
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

        const blob = new Blob([xml], { type: "text/plain;charset=utf-8" });
        return Promise.resolve(blob);
    }

    convertFrom(rawContent: ArrayBuffer): ProjectData {
        throw new Error("Method not implemented.");
    }
}
