import { TDocumentDefinitions } from "pdfmake/interfaces";
import * as pdfMake from "pdfmake/build/pdfmake";

const fonts = {
    CourierPrime: {
        normal: "http://localhost:3000/fonts/Courier%20Prime.ttf",
        bold: "http://localhost:3000/fonts/Courier%20Prime%20Bold.ttf",
        italics: "http://localhost:3000/fonts/Courier%20Prime.ttf",
        bolditalics: "http://localhost:3000/fonts/Courier%20Prime.ttf",
    },
};

const DEFAULT_OFFSET = 12;

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
        watermark: {
            text: "Test Productions",
            color: "grey",
            opacity: 0.15,
            bold: true,
            italics: false,
        },
        content: pdfNodes,
        pageMargins: [105, 70, 70, 70],
        defaultStyle: {
            font: "CourierPrime",
            fontSize: 12,
            alignment: "left",
            characterSpacing: -0.4,
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
                margin: [100, 0, 100, 0],
            },
            parenthetical: {
                margin: [140, 0],
            },
            action: {
                margin: [0, 0, 0, DEFAULT_OFFSET],
            },
            transition: {
                alignment: "right",
            },
            offset: {
                margin: [0, 0, 0, DEFAULT_OFFSET],
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
    json: any,
    title: string,
    author: string,
    characters?: string[]
) => {
    const nodes = json.content!;
    let pdfNodes = [];

    for (let i = 0; i < nodes.length; i++) {
        if (!nodes[i]["content"]) {
            continue;
        }

        const text: string = nodes[i]["content"]![0]["text"]!;
        const type: string = nodes[i]["attrs"]!["class"];

        let nextType = "action";
        if (i + 1 < nodes.length) nextType = nodes[i + 1]["attrs"]!["class"];

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
                pdfNodes.push(getPDFSceneTemplate(text.toUpperCase()));
                pdfNodes.push(getPDFNodeTemplate("offset", ""));
                break;
            case "character":
                pdfNodes.push(
                    getPDFNodeTemplate("character", text.toUpperCase())
                );
                break;
            case "dialogue":
                pdfNodes.push(getPDFNodeTemplate("dialogue", text));
                if (nextType !== "parenthetical")
                    pdfNodes.push(getPDFNodeTemplate("offset", ""));
                break;
            case "parenthetical":
                pdfNodes.push(
                    getPDFNodeTemplate("parenthetical", "(" + text + ")")
                );
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
