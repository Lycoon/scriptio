import { BaseExportOptions, ProjectAdapter } from "../screenplay-adapter";
import { XMLBuilder, XMLParser } from "@node_modules/fast-xml-parser/src/fxp";
import { getNodeFlattenContent } from "@src/lib/screenplay/screenplay";
import { ProjectData, ProjectState, screenplayOf } from "@src/lib/project/project-state";
import type { JSONContent } from "@tiptap/core";

interface FDXStyledText {
    "#text": string;
    "@_Style"?: string;
}

interface FDXParagraphNode {
    Text: FDXStyledText[];
    "@_Type"?: string;
    SceneProperties?: { "@_Length": string; "@_Page": string; "@_Title": string };
}

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

// Reverse lookup tables for parsing FDX files
const FDX_ELEMENT_REVERSE: Record<string, string> = Object.fromEntries(
    Object.entries(FDX_ELEMENT_TABLE).map(([k, v]) => [v, k]),
);

const FDX_STYLE_REVERSE: Record<string, string> = Object.fromEntries(
    Object.entries(FDX_STYLE_TABLE).map(([k, v]) => [v, k]),
);

export class FinalDraftAdapter extends ProjectAdapter<BaseExportOptions> {
    label = "Final Draft";
    extension = "fdx";

    convertTo(project: ProjectState, options: BaseExportOptions): Promise<Blob> {
        const paragraphNodes: FDXParagraphNode[] = [];
        const nodes = screenplayOf(project);
        const characters = options.characters;

        for (let i = 0; i < nodes.length; i++) {
            if (!nodes[i] || !nodes[i].content) continue;

            const content = nodes[i].content!;
            const flatText: string = getNodeFlattenContent(content);
            const type: string = nodes[i].attrs?.class;

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

            const textNodes: FDXStyledText[] = [];
            for (let j = 0; j < content.length; j++) {
                // <Text Style="style">
                const childNode = content[j];
                const textFragment: string = "text" in childNode ? childNode.text! : "";
                const styledNode: FDXStyledText = { "#text": textFragment };

                const styles: string[] = (content[j].marks ?? []).map((mark) => FDX_STYLE_TABLE[mark.type]);
                const fdxStyle: string = styles.join("+");
                if (fdxStyle) styledNode["@_Style"] = fdxStyle;

                textNodes.push(styledNode);
            }

            // <Paragraph Type="type">
            const paragraphNode: FDXParagraphNode = { Text: textNodes };
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

    convertFrom(rawContent: ArrayBuffer): Partial<ProjectData> {
        const decoder = new TextDecoder("utf-8");
        const xmlText = decoder.decode(rawContent);

        const parser = new XMLParser(options);
        const parsed = parser.parse(xmlText);

        const paragraphs = parsed?.FinalDraft?.Content?.Paragraph;
        if (!paragraphs) {
            throw new Error("Invalid FDX file: no paragraphs found");
        }

        // Ensure paragraphs is always an array
        const paragraphList = Array.isArray(paragraphs) ? paragraphs : [paragraphs];

        const screenplay: JSONContent[] = [];

        for (const paragraph of paragraphList) {
            const fdxType = paragraph["@_Type"] || "Action";
            const elementType = FDX_ELEMENT_REVERSE[fdxType] || "action";

            const textNodes = paragraph.Text;
            if (!textNodes) {
                // Empty paragraph
                screenplay.push({
                    type: elementType,
                    attrs: { class: elementType },
                    content: [],
                });
                continue;
            }

            // Ensure textNodes is always an array
            const textList = Array.isArray(textNodes) ? textNodes : [textNodes];

            const content: JSONContent[] = [];

            for (const textNode of textList) {
                // Handle both string content and object with #text
                const text = typeof textNode === "string" ? textNode : textNode["#text"] || "";

                if (!text) continue;

                const jsonNode: JSONContent = {
                    type: "text",
                    text: text,
                };

                // Parse styles (e.g., "Bold+Italic+Underline")
                const styleAttr = typeof textNode === "object" ? textNode["@_Style"] : undefined;
                if (styleAttr) {
                    const styles = styleAttr.split("+");
                    const marks: { type: string }[] = [];

                    for (const style of styles) {
                        const markType = FDX_STYLE_REVERSE[style];
                        if (markType) {
                            marks.push({ type: markType });
                        }
                    }

                    if (marks.length > 0) {
                        jsonNode.marks = marks;
                    }
                }

                content.push(jsonNode);
            }

            screenplay.push({
                type: elementType,
                attrs: { class: elementType },
                content: content.length > 0 ? content : undefined,
            });
        }

        return { screenplay };
    }
}
