import { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";
import { JSONContent } from "@tiptap/react";
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

export type PdfText = string | any[];

/**
 * Convert Tiptap inline content (with marks) to a pdfMake rich-text array.
 * If `uppercase` is true every text fragment is uppercased.
 */
export const buildRichText = (content: JSONContent[], uppercase?: boolean): PdfText => {
    // Fast path: single fragment with no marks → plain string
    if (content.length === 1 && (!content[0].marks || content[0].marks.length === 0)) {
        const t = content[0].text ?? "";
        return uppercase ? t.toUpperCase() : t;
    }

    const fragments: any[] = [];
    for (let i = 0; i < content.length; i++) {
        const child = content[i];
        let t = child.text ?? "";
        if (uppercase) t = t.toUpperCase();

        const marks: string[] = (child.marks ?? []).map((m: any) => m.type);
        const fragment: any = { text: t };

        if (marks.includes("bold")) fragment.bold = true;
        if (marks.includes("italic")) fragment.italics = true;
        if (marks.includes("underline")) fragment.decoration = "underline";

        fragments.push(fragment);
    }
    return fragments;
};

/**
 * Prepend / append plain text to a PdfText value.
 * If the value is a string, simple concatenation is used.
 * If the value is an array (rich text), plain-text fragments are added at the edges.
 */
export const wrapPdfText = (text: PdfText, prefix?: string, suffix?: string): PdfText => {
    if (typeof text === "string") {
        return (prefix ?? "") + text + (suffix ?? "");
    }
    const arr = [...text];
    if (prefix) arr.unshift({ text: prefix });
    if (suffix) arr.push({ text: suffix });
    return arr;
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

export const getPDFNodeTemplate = (style: string, text: PdfText, options?: SceneOptions, alignment?: string) => {
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

    if (alignment) {
        node.alignment = alignment;
    }

    return node;
};

export interface SceneWithNumberOptions {
    bold?: boolean;
    showRightNumber?: boolean;
    doubleSpace?: boolean;
    alignment?: string;
}

export const getSceneWithNumberTemplate = (sceneNumber: number, text: PdfText, options?: SceneWithNumberOptions) => {
    const bold = options?.bold ?? true;
    const showRightNumber = options?.showRightNumber ?? false;
    const doubleSpace = options?.doubleSpace ?? false;
    const topMargin = doubleSpace ? LINE_HEIGHT_PT : 0;

    const textColumn: any = {
        text,
        width: "*",
        bold,
        margin: [-30, topMargin, 0, 0],
    };

    if (options?.alignment) {
        textColumn.alignment = options.alignment;
    }

    const columns: any[] = [
        {
            text: `${sceneNumber}`,
            width: 30,
            bold,
            margin: [-50, topMargin, 0, 0],
        },
        textColumn,
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
            title: options.title,
            creator: "Scriptio",
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
            lineHeight: 0.9,
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
