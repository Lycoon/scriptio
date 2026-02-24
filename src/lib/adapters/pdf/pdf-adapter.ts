
import { BaseExportOptions, ProjectAdapter } from "../screenplay-adapter";
import { ProjectData, ProjectState } from "@src/lib/project/project-state";
import { PageFormat } from "@src/lib/utils/enums";
import { getFontForCodePoint, ScriptFont } from "./pdf-utils";
import { BASE_URL } from "@src/lib/utils/constants";
import { SCREENPLAY_FORMATS } from "@src/lib/screenplay/editor";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PDFExportOptions = BaseExportOptions & {
    format: PageFormat;
    watermark: boolean;
    password?: string;
    displaySceneNumbers?: boolean;
    sceneHeadingBold?: boolean;
    sceneHeadingDoubleSpace?: boolean;
    sceneNumberOnRight?: boolean;
    contdLabel?: string;
    moreLabel?: string;
    editorElement?: HTMLElement;
    titlePageElement?: HTMLElement;
};

import type { WorkerMessage, WorkerPayload, VisualLine } from "./pdf.worker";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Scale factor from browser pixels (96 DPI) to PDF points (72 DPI). */
const PX_TO_PT = 72 / 96;

/** Font size in PDF points. */
const FONT_SIZE = 12;

/** Top page margin in PDF points (1 inch). */
const PAGE_TOP = 72;

/** Right page margin in PDF points (1 inch). */
const PAGE_RIGHT = 72;

/** Y position of the page number header (0.5 inch from top). */
const HEADER_Y = 36;

/**
 * If two consecutive lines are separated by more than this many browser pixels,
 * a PDF page break is inserted. The pagination library inserts a visual gap of
 * roughly 20 px plus the page margins, so 50 px comfortably detects those gaps.
 */
const PAGE_BREAK_THRESHOLD = 50;

/** PDF page dimensions in points. */
const PDF_PAGE_SIZES: Record<PageFormat, { width: number; height: number }> = {
    LETTER: { width: 612, height: 792 },
    A4: { width: 595.28, height: 841.89 },
};

/** Browser left-margin values per format (from SCREENPLAY_FORMATS). */
const BROWSER_MARGIN_LEFT: Record<PageFormat, number> = {
    LETTER: SCREENPLAY_FORMATS.LETTER.marginLeft,
    A4: SCREENPLAY_FORMATS.A4.marginLeft,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map a `ScriptFont` value to the jsPDF font-family name. */
const fontFamilyFor = (sf: ScriptFont): string => sf ?? "CourierPrime";

/**
 * Read the computed style of a text node's parent element and determine
 * whether bold, italic, or underline is active.
 *
 * Using `getComputedStyle` captures both TipTap inline marks (`<span class="bold">`)
 * and paragraph-level styling (e.g. `.scene { font-weight: bold }`).
 */
const getMarksFromComputedStyle = (textNode: Text): { bold: boolean; italic: boolean; underline: boolean } => {
    const el = textNode.parentElement;
    if (!el) return { bold: false, italic: false, underline: false };
    const cs = getComputedStyle(el);
    return {
        bold: cs.fontWeight === "bold" || parseInt(cs.fontWeight) >= 700,
        italic: cs.fontStyle === "italic",
        underline: cs.textDecorationLine.includes("underline"),
    };
};

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class PDFAdapter extends ProjectAdapter<PDFExportOptions> {
    label = "PDF";
    extension = "pdf";

    async convertTo(project: ProjectState, options: PDFExportOptions): Promise<Blob> {
        const editorEl = options.editorElement;
        if (!editorEl) throw new Error("Editor element is required for DOM-based PDF export");

        const format = options.format;

        // ── Collect all visual lines from the browser DOM ───────────────────
        const titlePageEl = options.titlePageElement;
        
        const titlePageLines = titlePageEl ? this.collectLines(titlePageEl, format, options) : [];
        const titlePageLeftPx = titlePageEl ? this.getPageLeftPx(titlePageEl, format) : 0;
        
        const screenplayLines = this.collectLines(editorEl, format, options);
        const screenplayLeftPx = this.getPageLeftPx(editorEl, format);

        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL("./pdf.worker.ts", import.meta.url));

            worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
                const msg = e.data;
                if (msg.type === "PROGRESS") {
                    if (options.onProgress) options.onProgress(msg.progress);
                } else if (msg.type === "DONE") {
                    worker.terminate();
                    resolve(msg.blob);
                } else if (msg.type === "ERROR") {
                    worker.terminate();
                    reject(new Error(msg.error));
                }
            };

            worker.onerror = (e) => {
                worker.terminate();
                reject(new Error("Worker failed directly: " + e.message));
            };

            const payload: WorkerPayload = {
                baseUrl: BASE_URL,
                format,
                watermark: options.watermark,
                password: options.password,
                author: options.author,
                titlePageLines,
                titlePageLeftPx,
                screenplayLines,
                screenplayLeftPx,
                contdLabel: options.contdLabel ?? "(CONT'D)",
                moreLabel: options.moreLabel ?? "(MORE)",
            };

            worker.postMessage({ type: "START", payload });
        });
    }

    convertFrom(_rawContent: ArrayBuffer): Partial<ProjectData> {
        throw new Error("Method not implemented.");
    }

    // ── DOM → VisualLine[] ───────────────────────────────────────────────────

    /**
     * Walk the editor DOM and build a flat list of `VisualLine`s — one per
     * visual text line as laid out by the browser.
     *
     * The first two children of `editorEl` are pagination chrome and are
     * skipped. Non-`<p>` children (breakers, gaps, headers, footers) are
     * also skipped.
     */
    private collectLines(editorEl: HTMLElement, format: PageFormat, options: PDFExportOptions): VisualLine[] {
        const allLines: VisualLine[] = [];
        let sceneCount = 0;
        let yOffset = 0;

        for (let i = 2; i < editorEl.children.length; i++) {
            const el = editorEl.children[i] as HTMLElement;
            if (!el || el.tagName !== "P") continue;

            const isScene = el.classList.contains("scene");
            if (isScene) {
                sceneCount++;
            }

            // Extract the paragraph type from classList
            let nodeType: string | undefined;
            const elementClasses = ["scene", "action", "character", "dialogue", "parenthetical", "transition", "section"];
            for (const cls of elementClasses) {
                if (el.classList.contains(cls)) {
                    nodeType = cls;
                    break;
                }
            }

            // Skip notes when not exporting them
            if (!options.includeNotes && el.classList.contains("note")) {
                const rect = el.getBoundingClientRect();
                const style = getComputedStyle(el);
                const mt = parseFloat(style.marginTop) || 0;
                const mb = parseFloat(style.marginBottom) || 0;
                // Subtract node height plus one margin length, simulating DOM margin collapse
                yOffset += rect.height + Math.max(mt, mb);
                continue;
            }

            const paragraphLines = this.collectParagraphLines(el, nodeType);

            if (paragraphLines.length > 0) {
                // Apply yOffset to close physical gaps from entirely skipped text nodes
                if (yOffset > 0) {
                    for (const line of paragraphLines) {
                        line.y -= yOffset;
                    }
                }
                // ── Pseudo-element content (not captured by TreeWalker) ──
                this.injectPseudoContent(el, paragraphLines, options, isScene ? sceneCount : undefined);
                allLines.push(...paragraphLines);
            } else {
                // Empty paragraph — no text nodes, so collectParagraphLines
                // Returns nothing. We still emit a zero-run VisualLine at
                // the paragraph's browser Y position so that renderLines
                // advances Y by exactly one line height and does NOT
                // misinterpret the accumulated gap as a page break.
                const rect = el.getBoundingClientRect();
                if (rect.height > 0) {
                    allLines.push({ runs: [], y: rect.top - yOffset, type: nodeType });
                }
            }
        }

        return allLines;
    }

    /**
     * For a single `<p>` element, iterate character-by-character using the
     * Range API to detect the exact browser line breaks and build
     * `VisualLine` objects.
     */
    private collectParagraphLines(el: HTMLElement, type?: string): VisualLine[] {
        const lines: VisualLine[] = [];
        const range = document.createRange();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);

        // Whether the paragraph applies text-transform: uppercase
        const uppercase = getComputedStyle(el).textTransform === "uppercase";

        let currentLine: VisualLine | null = null;
        let currentRun: any | null = null;
        let previousY = -1;

        let textNode: Text | null;
        while ((textNode = walker.nextNode() as Text | null)) {
            const text = textNode.nodeValue!;
            if (!text) continue;

            // Resolve marks once per text node (they don't change mid-node)
            const marks = getMarksFromComputedStyle(textNode);
            const isRightNumber = textNode.parentElement?.classList.contains("scene-number-right") ?? false;

            for (let ci = 0; ci < text.length; ci++) {
                const rawChar = text[ci];
                const cp = rawChar.codePointAt(0)!;
                const font = fontFamilyFor(getFontForCodePoint(cp));
                const char = uppercase ? rawChar.toUpperCase() : rawChar;

                const isSameRun = () =>
                    currentRun !== null &&
                    currentRun.fontFamily === font &&
                    currentRun.bold === marks.bold &&
                    currentRun.italic === marks.italic &&
                    currentRun.underline === marks.underline &&
                    currentRun.absolutePosition === isRightNumber;

                // ── Measure position ─────────────────────────────────────
                range.setStart(textNode, ci);
                range.setEnd(textNode, ci + 1);
                const rect = range.getBoundingClientRect();

                // If height is 0, it is usually a trailing wrapped space or hidden char
                if (rect.height === 0) {
                    if (rawChar.trim() === "") {
                        if (isSameRun()) {
                            currentRun!.text += char;
                        } else {
                            if (currentRun) {
                                if (!currentLine) currentLine = { runs: [], y: previousY !== -1 ? previousY : 0, type };
                                currentLine.runs.push(currentRun);
                            }
                            currentRun = {
                                text: char,
                                x: currentRun ? currentRun.x : 0,
                                fontFamily: font,
                                bold: marks.bold,
                                italic: marks.italic,
                                underline: marks.underline,
                                absolutePosition: isRightNumber,
                            };
                        }
                    }
                    continue;
                }

                // ── New line detected? ───────────────────────────────────
                if (previousY !== -1 && rect.top > previousY + 2) {
                    // Finalise previous run/line
                    if (currentRun) {
                        currentLine!.runs.push(currentRun);
                        currentRun = null;
                    }
                    if (currentLine) lines.push(currentLine);
                    currentLine = null;
                }

                // Start a fresh line if needed
                if (!currentLine) {
                    currentLine = { runs: [], y: rect.top, type };
                }

                // ── Update or start run ──────────────────────────────────
                if (isSameRun()) {
                    currentRun!.text += char;
                } else {
                    if (currentRun) currentLine.runs.push(currentRun);
                    currentRun = {
                        text: char,
                        x: rect.left,
                        fontFamily: font,
                        bold: marks.bold,
                        italic: marks.italic,
                        underline: marks.underline,
                        absolutePosition: isRightNumber,
                    };
                }

                previousY = rect.top;
            }
        }

        // Flush the last run/line
        if (currentRun && currentLine) {
            currentLine.runs.push(currentRun);
        }
        if (currentLine && currentLine.runs.length > 0) {
            lines.push(currentLine);
        }

        return lines;
    }

    /**
     * Manually inject pseudo-element text that CSS `content` generates but
     * the TreeWalker cannot see.
     *
     * - `.parenthetical::before` → `"("`
     * - `.parenthetical::after`  → `")"`
     * - `.transition::after`     → `":"`
     * - `.character.contd::after` → `" (CONT'D)"`
     */
    private injectPseudoContent(
        el: HTMLElement,
        paragraphLines: VisualLine[],
        options: PDFExportOptions,
        sceneNumber?: number,
    ): void {
        const firstLine = paragraphLines[0];
        const lastLine = paragraphLines[paragraphLines.length - 1];

        if (sceneNumber !== undefined && options.displaySceneNumbers && !options.sceneNumberOnRight) {
            if (firstLine.runs.length > 0) {
                const leadRun = firstLine.runs[0];
                firstLine.runs.unshift({
                    text: String(sceneNumber) + ".",
                    x: leadRun.x - 72,
                    fontFamily: leadRun.fontFamily,
                    bold: leadRun.bold,
                    italic: leadRun.italic,
                    underline: leadRun.underline,
                    absolutePosition: true,
                });
            }
        }

        if (el.classList.contains("parenthetical")) {
            // Prepend "(" — the CSS positions it 1ch before the text
            if (firstLine.runs.length > 0) {
                const leadRun = firstLine.runs[0];
                firstLine.runs.unshift({
                    text: "(",
                    x: leadRun.x, // will be adjusted during rendering (shifted left by char width)
                    fontFamily: leadRun.fontFamily,
                    bold: leadRun.bold,
                    italic: leadRun.italic,
                    underline: leadRun.underline,
                });
            }
            // Append ")"
            if (lastLine.runs.length > 0) {
                const tailRun = lastLine.runs[lastLine.runs.length - 1];
                lastLine.runs.push({
                    text: ")",
                    x: 0, // X will be computed from previous run width during rendering
                    fontFamily: tailRun.fontFamily,
                    bold: tailRun.bold,
                    italic: tailRun.italic,
                    underline: tailRun.underline,
                });
            }
        }

        if (el.classList.contains("transition")) {
            if (lastLine.runs.length > 0) {
                const tailRun = lastLine.runs[lastLine.runs.length - 1];
                tailRun.text += ":";
            }
        }

        if (el.classList.contains("contd")) {
            const label = options.contdLabel ?? "(CONT'D)";
            if (lastLine.runs.length > 0) {
                const tailRun = lastLine.runs[lastLine.runs.length - 1];
                tailRun.text += " " + label;
            }
        }
    }

    // ── VisualLine[] → PDF ───────────────────────────────────────────────────

    /**
     * Compute the page-left reference in browser pixels
     * using the first encountered `<p>` element and the known CSS margin format.
     */
    private getPageLeftPx(referenceEl: HTMLElement, format: PageFormat): number {
        const marginLeftPx = BROWSER_MARGIN_LEFT[format];

        let referenceLeft = 0;
        for (let i = 2; i < referenceEl.children.length; i++) {
            const child = referenceEl.children[i] as HTMLElement;
            if (child?.tagName === "P") {
                referenceLeft = child.getBoundingClientRect().left;
                break;
            }
        }
        return referenceLeft - marginLeftPx;
    }
}
