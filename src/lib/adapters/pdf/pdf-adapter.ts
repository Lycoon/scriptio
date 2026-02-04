import { BaseExportOptions, ProjectAdapter } from "../screenplay-adapter";
import {
    addOffset,
    FONTS,
    getPDFNodeTemplate,
    getPDFTableTemplate,
    getSceneWithNumberTemplate,
    initPDF,
} from "./pdf-utils";
import { getNodeFlattenContent } from "@src/lib/screenplay/screenplay";
import { computeContdIndices } from "@src/lib/screenplay/contd";
import { ProjectData, ProjectState } from "@src/lib/project/project-state";
import * as pdfMake from "pdfmake/build/pdfmake";
import { PageFormat } from "@src/lib/utils/enums";

export type PDFExportOptions = BaseExportOptions & {
    format: PageFormat;
    watermark: boolean;
    password?: string;
    displaySceneNumbers?: boolean;
    sceneHeadingBold?: boolean;
    sceneHeadingDoubleSpace?: boolean;
    sceneNumberOnRight?: boolean;
    contdLabel?: string;
};

export class PDFAdapter extends ProjectAdapter<PDFExportOptions> {
    label = "PDF";
    extension = "pdf";

    convertTo(project: ProjectState, options: PDFExportOptions): Promise<Blob> {
        const characters = options.characters;
        const nodes = project.screenplay();
        const contdIndices = computeContdIndices(nodes);
        const displaySceneNumbers = options.displaySceneNumbers ?? true;
        const sceneHeadingBold = options.sceneHeadingBold ?? true;
        const sceneHeadingDoubleSpace = options.sceneHeadingDoubleSpace ?? false;
        const sceneNumberOnRight = options.sceneNumberOnRight ?? false;
        const contdLabel = options.contdLabel ?? "(CONT'D)";
        let pdfNodes = [];
        let sceneNumber = 0;

        for (let i = 0; i < nodes.length; i++) {
            if (!nodes[i].content) {
                continue;
            }

            const content = nodes[i].content!;
            const text: string = getNodeFlattenContent(content);
            const type: string = nodes[i].attrs?.class;
            const nextType: string = i >= nodes.length - 1 ? "action" : nodes[i + 1].attrs?.class;

            // Don't export unselected characters
            if (type === "character" && characters && !characters.includes(text)) {
                let j = i + 1;
                for (; j < nodes.length; j++) {
                    const typeJ: string = nodes[j].attrs?.class;
                    if (typeJ === "dialogue" || typeJ === "parenthetical") continue;
                    break;
                }
                i = j - 1;
                continue;
            }

            switch (type) {
                case "scene":
                    sceneNumber++;
                    if (displaySceneNumbers) {
                        pdfNodes.push(
                            getSceneWithNumberTemplate(sceneNumber, text.toUpperCase(), {
                                bold: sceneHeadingBold,
                                showRightNumber: sceneNumberOnRight,
                                doubleSpace: sceneHeadingDoubleSpace,
                            }),
                        );
                    } else {
                        pdfNodes.push(
                            getPDFNodeTemplate("scene", text.toUpperCase(), {
                                bold: sceneHeadingBold,
                                doubleSpace: sceneHeadingDoubleSpace,
                            }),
                        );
                    }
                    addOffset(pdfNodes);
                    break;
                case "character":
                    const characterText = contdIndices.has(i) ? text.toUpperCase() + " " + contdLabel : text.toUpperCase();
                    pdfNodes.push(getPDFNodeTemplate("character", characterText));
                    break;
                case "dialogue":
                    pdfNodes.push(getPDFNodeTemplate("dialogue", text));
                    if (nextType !== "parenthetical") addOffset(pdfNodes);
                    break;
                case "parenthetical":
                    pdfNodes.push(getPDFNodeTemplate("parenthetical", "(" + text + ")"));
                    break;
                case "transition":
                    pdfNodes.push(getPDFNodeTemplate("transition", text.toUpperCase() + ":"));
                    addOffset(pdfNodes);
                    break;
                case "section":
                    pdfNodes.push(getPDFNodeTemplate("section", text.toUpperCase()));
                    addOffset(pdfNodes);
                    break;
                case "note":
                    if (options.includeNotes) {
                        pdfNodes.push(getPDFTableTemplate(text, "note"));
                        //addOffset(pdfNodes);
                    }
                    break;
                default:
                    pdfNodes.push(getPDFNodeTemplate("action", text));
                    addOffset(pdfNodes);
            }
        }

        let pdf = initPDF(options, pdfNodes);
        if (options.watermark) {
            pdf.watermark = {
                text: options.author,
                color: "grey",
                opacity: 0.15,
                bold: true,
                italics: false,
            };
        }
        if (options.password) {
            pdf.userPassword = options.password;
        }

        const doc = pdfMake.createPdf(pdf, undefined, FONTS);
        return new Promise<Blob>((resolve) => {
            doc.getBlob((blob) => {
                resolve(blob);
            });
        });
    }

    convertFrom(rawContent: ArrayBuffer): Partial<ProjectData> {
        throw new Error("Method not implemented.");
    }
}
