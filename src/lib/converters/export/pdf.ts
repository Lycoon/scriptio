import { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";
import { ExportData, ExportDataPDF } from "@src/lib/converters/utils";
import { BASE_URL } from "@src/lib/utils/constants";
import * as pdfMake from "pdfmake/build/pdfmake";

const FONTS: TFontDictionary = {
    CourierPrime: {
        normal: `${BASE_URL}/fonts/CourierPrimeRegular.ttf`,
        bold: `${BASE_URL}/fonts/CourierPrimeBold.ttf`,
        italics: `${BASE_URL}/fonts/CourierPrimeItalic.ttf`,
        bolditalics: `${BASE_URL}/fonts/CourierPrimeBoldItalic.ttf`,
    },
};

const DEFAULT_OFFSET = 12;
const addOffset = (pdfNodes: any[]) => {
    pdfNodes.push(getPDFNodeTemplate("offset", ""));
};

const getPDFTableTemplate = (text: string, type: string) => {
    return {
        layout: "noBorders",
        table: {
            widths: ["*"],
            body: [
                [
                    {
                        text,
                        style: [type],
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

const getWatermarkData = (text: string) => {
    return {
        text,
        color: "grey",
        opacity: 0.15,
        bold: true,
        italics: false,
    };
};

const initPDF = (exportData: ExportData, pdfNodes: any[]): TDocumentDefinitions => {
    return {
        info: {
            author: exportData.author,
        },
        header: (currentPage, pageCount, pageSize) => {
            return [{
                text: `${currentPage}.`,
                alignment: "right",
                marginRight: 96,
                marginTop: 48
            }]
        },
        content: pdfNodes,
        pageMargins: [144, 96, 96, 96],
        pageSize: "A4",
        defaultStyle: {
            font: "CourierPrime",
            fontSize: 12,
            alignment: "left"
        },
        styles: {
            scene: {
                bold: true,
            },
            note: {
                fillColor: exportData.notesColor ?? "#FFFF68",
                margin: [6, 0, 0, 0],
            },
            character: {
                margin: [211, 0, 0, 0],
            },
            dialogue: {
                margin: [115, 0, 100, 0],
            },
            parenthetical: {
                margin: [182, 0],
            },
            action: {
                margin: [0, 0, 0, DEFAULT_OFFSET],
            },
            transition: {
                alignment: "right",
                margin: [0, 0, 0, DEFAULT_OFFSET],
            },
            section: {
                alignment: "center",
                decoration: "underline",
                margin: [0, 0, 0, DEFAULT_OFFSET],
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
export const exportToPDF = async (json: any, exportData: ExportDataPDF) => {
    const characters = exportData.characters;
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
                pdfNodes.push(getPDFNodeTemplate("scene", text.toUpperCase()));
                addOffset(pdfNodes);
                break;
            case "character":
                pdfNodes.push(getPDFNodeTemplate("character", text.toUpperCase()));
                break;
            case "dialogue":
                pdfNodes.push(getPDFNodeTemplate("dialogue", text));
                if (nextType !== "parenthetical") {
                    addOffset(pdfNodes);
                }
                break;
            case "parenthetical":
                pdfNodes.push(getPDFNodeTemplate("parenthetical", "(" + text + ")"));
                break;
            case "transition":
                pdfNodes.push(getPDFNodeTemplate("transition", text.toUpperCase() + ":"));
                break;
            case "section":
                pdfNodes.push(getPDFNodeTemplate("section", text.toUpperCase()));
                break;
            case "note":
                if (exportData.notes) {
                    pdfNodes.push(getPDFTableTemplate(text, "note"));
                    addOffset(pdfNodes);
                }
                break;
            default:
                pdfNodes.push(getPDFNodeTemplate("action", text));
        }
    }

    let pdf = initPDF(exportData, pdfNodes);
    if (exportData.watermark) {
        pdf.watermark = {
            text: exportData.author,
            color: "grey",
            opacity: 0.15,
            bold: true,
            italics: false,
        };
    }

    return pdfMake.createPdf(pdf, undefined, FONTS);
};
