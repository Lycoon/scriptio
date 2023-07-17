import { TDocumentDefinitions } from "pdfmake/interfaces";
import * as pdfMake from "pdfmake/build/pdfmake";
import { ExportData, ExportDataPDF } from "@components/projects/export/ExportProjectContainer";

const LOCAL = "http://localhost:3000";
const PRODUCTION = "https://scriptio.app";
const BASE_URL = LOCAL;

const fonts = {
    CourierPrime: {
        normal: BASE_URL + "/fonts/Courier%20Prime.ttf",
        bold: BASE_URL + "/fonts/Courier%20Prime%20Bold.ttf",
        italics: BASE_URL + "/fonts/Courier%20Prime.ttf",
        bolditalics: BASE_URL + "/fonts/Courier%20Prime.ttf",
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
            title: exportData.title,
            author: exportData.author,
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
                fillColor: "#e4e4e4",
                lineHeight: 0.85,
                margin: [4, 0, 0, 0],
            },
            note: {
                fillColor: exportData.notesColor ?? "#FFFF68",
                margin: [6, 0, 0, 0],
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
                pdfNodes.push(getPDFTableTemplate(text.toUpperCase(), "scene"));
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

    pdfMake.createPdf(pdf, undefined, fonts).open();
};
