import { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";
import { BASE_URL } from "@src/lib/utils/constants";
import { PDFExportOptions } from "./pdf-adapter";

export const FONTS: TFontDictionary = {
    CourierPrime: {
        normal: `${BASE_URL}/fonts/CourierPrimeRegular.ttf`,
        bold: `${BASE_URL}/fonts/CourierPrimeBold.ttf`,
        italics: `${BASE_URL}/fonts/CourierPrimeItalic.ttf`,
        bolditalics: `${BASE_URL}/fonts/CourierPrimeBoldItalic.ttf`,
    },
};

//
// Units are in points (pt)
// Conversion from inches to points -> x72
//
const ONE_INCH = 72.0;

const LINE_HEIGHT_PT = 12; // One line of 12pt Courier = 12pt

const CHARACTER_L = 2.5 * ONE_INCH;
const DIALOGUE_L = 1.3 * ONE_INCH;
const DIALOGUE_R = 1.0 * ONE_INCH;
const PARENTHETICAL_L = 2.0 * ONE_INCH;
const PARENTHETICAL_R = 2.0 * ONE_INCH;

const PAGE_LEFT = 1.5 * ONE_INCH;
const PAGE_RIGHT = ONE_INCH;
const PAGE_TOP = ONE_INCH;
const PAGE_BOTTOM = ONE_INCH;

export const addOffset = (pdfNodes: any[]) => {
    pdfNodes.push({ text: " ", fontSize: 0, style: ["offset"] });
};

export const getPDFTableTemplate = (text: string, type: string) => {
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

export interface SceneOptions {
    bold?: boolean;
    doubleSpace?: boolean;
}

export const getPDFNodeTemplate = (style: string, text: string, options?: SceneOptions) => {
    const node: any = {
        text,
        style: [style],
    };

    // Handle scene-specific options
    if (style === "scene" && options) {
        if (options.bold === false) {
            node.bold = false;
        }
        if (options.doubleSpace) {
            node.margin = [0, LINE_HEIGHT_PT, 0, 0];
        }
    }

    return node;
};

export interface SceneWithNumberOptions {
    bold?: boolean;
    showRightNumber?: boolean;
    doubleSpace?: boolean;
}

export const getSceneWithNumberTemplate = (sceneNumber: number, text: string, options?: SceneWithNumberOptions) => {
    const bold = options?.bold ?? true;
    const showRightNumber = options?.showRightNumber ?? false;
    const doubleSpace = options?.doubleSpace ?? false;
    const topMargin = doubleSpace ? LINE_HEIGHT_PT : 0;

    const columns: any[] = [
        {
            text: `${sceneNumber}`,
            width: 30,
            bold,
            margin: [-50, topMargin, 0, 0],
        },
        {
            text,
            width: "*",
            bold,
            margin: [-30, topMargin, 0, 0],
        },
    ];

    if (showRightNumber) {
        columns.push({
            text: `${sceneNumber}`,
            width: 30,
            bold,
            alignment: "right",
            margin: [0, topMargin, -50, 0],
        });
    }

    return { columns };
};

export const getWatermarkData = (text: string) => {
    return {
        text,
        color: "grey",
        opacity: 0.15,
        bold: true,
        italics: false,
    };
};

export const initPDF = (options: PDFExportOptions, pdfNodes: any[]): TDocumentDefinitions => {
    return {
        info: {
            author: options.author,
        },
        header: (currentPage, pageCount, pageSize) => {
            if (currentPage === 1) {
                return;
            }
            return [
                {
                    text: `${currentPage}.`,
                    alignment: "right",
                    marginRight: 72,
                    marginTop: 36,
                },
            ];
        },
        content: pdfNodes,
        pageMargins: [PAGE_LEFT, PAGE_TOP, PAGE_RIGHT, PAGE_BOTTOM],
        pageSize: options.format,
        defaultStyle: {
            font: "CourierPrime",
            fontSize: 12,
            alignment: "left",
            characterSpacing: -0.7,
            lineHeight: 1.0,
        },
        styles: {
            scene: {
                bold: true,
            },
            note: {
                fillColor: options.notesColor ?? "#FFFF68",
            },
            character: {
                margin: [CHARACTER_L, 0, 0, 0],
            },
            dialogue: {
                margin: [DIALOGUE_L, 0, DIALOGUE_R, 0],
            },
            parenthetical: {
                margin: [PARENTHETICAL_L, 0, PARENTHETICAL_R, 0],
            },
            transition: {
                alignment: "right",
            },
            section: {
                alignment: "center",
                decoration: "underline",
            },
            action: {},
            offset: {
                marginBottom: LINE_HEIGHT_PT,
            },
        },
    };
};
