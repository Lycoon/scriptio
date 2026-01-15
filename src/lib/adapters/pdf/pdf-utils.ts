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
const DEFAULT_OFFSET = 11; // ~17px (1 line height)
const ONE_INCH = 72;

const CHARACTER_L = 2.2 * ONE_INCH;
const DIALOGUE_L = 1.2 * ONE_INCH;
const DIALOGUE_R = 1.2 * ONE_INCH;
const PARENTHETICAL_L = 1.9 * ONE_INCH;
const PARENTHETICAL_R = 2.1 * ONE_INCH;

const PAGE_LEFT = 1.5 * ONE_INCH;
const PAGE_RIGHT = ONE_INCH;
const PAGE_TOP = ONE_INCH;
const PAGE_BOTTOM = ONE_INCH;

export const addOffset = (pdfNodes: any[]) => {
    pdfNodes.push(getPDFNodeTemplate("offset", ""));
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

export const getPDFNodeTemplate = (style: string, text: string) => {
    return {
        text,
        style: [style],
    };
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
        pageMargins: [PAGE_LEFT, PAGE_RIGHT, PAGE_TOP, PAGE_BOTTOM],
        pageSize: options.format,
        defaultStyle: {
            font: "CourierPrime",
            fontSize: 12,
            alignment: "left",
            characterSpacing: -0.3,
        },
        styles: {
            scene: {
                bold: true,
                margin: [0, DEFAULT_OFFSET, 0, 0],
            },
            note: {
                fillColor: options.notesColor ?? "#FFFF68",
                margin: [6, 0, 0, 0],
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
