import { BaseExportOptions, ProjectAdapter } from "../screenplay-adapter";
import {
    addOffset,
    buildRichText,
    buildTitlePage,
    FONTS,
    getPDFNodeTemplate,
    getPDFTableTemplate,
    getSceneWithNumberTemplate,
    initPDF,
    wrapPdfText,
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
            const content = nodes[i].content || [];
            const plainText: string = getNodeFlattenContent(content);
            const type: string = nodes[i].attrs?.class;
            const nextType: string = i >= nodes.length - 1 ? "action" : nodes[i + 1].attrs?.class;
            const align: string | undefined = nodes[i].attrs?.textAlign || undefined;

            // Don't export unselected characters
            if (type === "character" && characters && !characters.includes(plainText)) {
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
                case "scene": {
                    const rich = buildRichText(content, true);
                    sceneNumber++;
                    if (displaySceneNumbers) {
                        pdfNodes.push(
                            getSceneWithNumberTemplate(sceneNumber, rich, {
                                bold: sceneHeadingBold,
                                showRightNumber: sceneNumberOnRight,
                                doubleSpace: sceneHeadingDoubleSpace,
                                alignment: align,
                            }),
                        );
                    } else {
                        pdfNodes.push(
                            getPDFNodeTemplate("scene", rich, {
                                bold: sceneHeadingBold,
                                doubleSpace: sceneHeadingDoubleSpace,
                            }, align),
                        );
                    }
                    addOffset(pdfNodes);
                    break;
                }
                case "character": {
                    let rich = buildRichText(content, true);
                    if (contdIndices.has(i)) {
                        rich = wrapPdfText(rich, undefined, " " + contdLabel);
                    }
                    pdfNodes.push(getPDFNodeTemplate("character", rich, undefined, align));
                    break;
                }
                case "dialogue": {
                    const rich = buildRichText(content);
                    pdfNodes.push(getPDFNodeTemplate("dialogue", rich, undefined, align));
                    if (nextType !== "parenthetical") addOffset(pdfNodes);
                    break;
                }
                case "parenthetical": {
                    const rich = wrapPdfText(buildRichText(content), "(", ")");
                    pdfNodes.push(getPDFNodeTemplate("parenthetical", rich, undefined, align));
                    break;
                }
                case "transition": {
                    const rich = wrapPdfText(buildRichText(content, true), undefined, ":");
                    pdfNodes.push(getPDFNodeTemplate("transition", rich, undefined, align));
                    addOffset(pdfNodes);
                    break;
                }
                case "section": {
                    const rich = buildRichText(content, true);
                    pdfNodes.push(getPDFNodeTemplate("section", rich, undefined, align));
                    addOffset(pdfNodes);
                    break;
                }
                case "note":
                    if (options.includeNotes) {
                        pdfNodes.push(getPDFTableTemplate(plainText, "note"));
                        //addOffset(pdfNodes);
                    }
                    break;
                default: {
                    const rich = buildRichText(content);
                    pdfNodes.push(getPDFNodeTemplate("action", rich, undefined, align));
                    addOffset(pdfNodes);
                }
            }
        }

        const titlePageContent = project.titlepage();
        const titlePage = buildTitlePage(titlePageContent, options);
        const allNodes = [...titlePage, ...pdfNodes];
        let pdf = initPDF(options, allNodes);
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
