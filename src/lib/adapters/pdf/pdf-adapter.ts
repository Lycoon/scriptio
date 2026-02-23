import { jsPDF, GState } from "jspdf";
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
    editorElement?: HTMLElement;
    titlePageElement?: HTMLElement;
};

/** A contiguous run of characters sharing the same font and style. */
interface TextRun {
    text: string;
    x: number; // browser X position in pixels
    fontFamily: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    absolutePosition?: boolean;
}

/** A single visual line as laid out by the browser. */
interface VisualLine {
    runs: TextRun[];
    y: number; // browser Y position in pixels (for page-break detection)
}

/** Font file descriptor for registration in jsPDF. */
interface FontEntry {
    filename: string;
    family: string;
    style: string; // jsPDF style: "normal" | "bold" | "italic" | "bolditalic"
}

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

/**
 * All font files to register with jsPDF.
 *
 * CourierBadi only ships a Regular weight, so we register it under every style
 * slot. jsPDF will render the regular glyphs instead of crashing when bold or
 * italic is requested for Cyrillic / Arabic text.
 */
const FONT_ENTRIES: FontEntry[] = [
    // CourierPrime — Latin (4 true variants)
    { filename: "CourierPrime-Regular.ttf", family: "CourierPrime", style: "normal" },
    { filename: "CourierPrime-Bold.ttf", family: "CourierPrime", style: "bold" },
    { filename: "CourierPrime-Italic.ttf", family: "CourierPrime", style: "italic" },
    { filename: "CourierPrime-BoldItalic.ttf", family: "CourierPrime", style: "bolditalic" },
    // FreeMono — Arabic (Regular only → all 4 slots)
    { filename: "FreeMono-Regular.ttf", family: "FreeMono", style: "normal" },
    { filename: "FreeMono-Bold.ttf", family: "FreeMono", style: "bold" },
    { filename: "FreeMono-Italic.ttf", family: "FreeMono", style: "italic" },
    { filename: "FreeMono-BoldItalic.ttf", family: "FreeMono", style: "bolditalic" },
    // Cousine — Greek / Hebrew (4 true variants)
    { filename: "Cousine-Regular.ttf", family: "Cousine", style: "normal" },
    { filename: "Cousine-Bold.ttf", family: "Cousine", style: "bold" },
    { filename: "Cousine-Italic.ttf", family: "Cousine", style: "italic" },
    { filename: "Cousine-BoldItalic.ttf", family: "Cousine", style: "bolditalic" },
    // SarasaMonoSC — CJK (4 true variants)
    { filename: "SarasaMonoSC-Regular.ttf", family: "SarasaMonoSC", style: "normal" },
    { filename: "SarasaMonoSC-Bold.ttf", family: "SarasaMonoSC", style: "bold" },
    { filename: "SarasaMonoSC-Italic.ttf", family: "SarasaMonoSC", style: "italic" },
    { filename: "SarasaMonoSC-BoldItalic.ttf", family: "SarasaMonoSC", style: "bolditalic" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map a `ScriptFont` value to the jsPDF font-family name. */
const fontFamilyFor = (sf: ScriptFont): string => sf ?? "CourierPrime";

/** Derive the jsPDF font-style string from bold/italic flags. */
const jsPDFStyle = (bold: boolean, italic: boolean): string => {
    if (bold && italic) return "bolditalic";
    if (bold) return "bold";
    if (italic) return "italic";
    return "normal";
};

/** Convert an ArrayBuffer to a base-64 string. */
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
};

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
        const pageSize = PDF_PAGE_SIZES[format];

        // ── Create jsPDF document ────────────────────────────────────────────
        const doc = new jsPDF({
            orientation: "portrait",
            unit: "pt",
            format: [pageSize.width, pageSize.height],
            compress: true,
            ...(options.password ? { encryption: { userPassword: options.password } } : {}),
        });

        // ── Load & register every font variant ──────────────────────────────
        await this.loadFonts(doc);

        doc.setFont("CourierPrime", "normal");
        doc.setFontSize(FONT_SIZE);

        // ── Render title page (if any) ──────────────────────────────────────
        const titlePageEl = options.titlePageElement;
        const hasTitlePage = titlePageEl ? this.renderTitlePage(doc, titlePageEl, pageSize, options) : false;

        if (hasTitlePage) {
            // Watermark already drawn by renderTitlePage via renderLines.
            doc.addPage();
        }

        // ── Collect all visual lines from the browser DOM ───────────────────
        const lines = this.collectLines(editorEl, format, options);

        // ── Render lines into the PDF ───────────────────────────────────────
        this.renderLines(doc, lines, pageSize, options, editorEl, true);

        return doc.output("blob");
    }

    convertFrom(_rawContent: ArrayBuffer): Partial<ProjectData> {
        throw new Error("Method not implemented.");
    }

    // ── Font loading ─────────────────────────────────────────────────────────

    /**
     * Fetch every .ttf file and register it with jsPDF.
     * Files are fetched from `${BASE_URL}/fonts/` and converted to base-64.
     */
    private async loadFonts(doc: jsPDF): Promise<void> {
        // Deduplicate file fetches — CourierBadi-Regular.ttf is referenced 4×.
        const fetchedFiles = new Map<string, string>();

        for (const entry of FONT_ENTRIES) {
            let base64 = fetchedFiles.get(entry.filename);
            if (!base64) {
                const url = `${BASE_URL}/fonts/${entry.filename}`;
                const response = await fetch(url);
                if (!response.ok) {
                    console.warn(`Failed to load font: ${url}`);
                    continue;
                }
                const buffer = await response.arrayBuffer();
                base64 = arrayBufferToBase64(buffer);
                fetchedFiles.set(entry.filename, base64);
            }

            doc.addFileToVFS(entry.filename, base64);
            doc.addFont(entry.filename, entry.family, entry.style);
        }
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

            const paragraphLines = this.collectParagraphLines(el);

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
                // returns nothing. We still emit a zero-run VisualLine at
                // the paragraph's browser Y position so that renderLines
                // advances Y by exactly one line height and does NOT
                // misinterpret the accumulated gap as a page break.
                const rect = el.getBoundingClientRect();
                if (rect.height > 0) {
                    allLines.push({ runs: [], y: rect.top - yOffset });
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
    private collectParagraphLines(el: HTMLElement): VisualLine[] {
        const lines: VisualLine[] = [];
        const range = document.createRange();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);

        // Whether the paragraph applies text-transform: uppercase
        const uppercase = getComputedStyle(el).textTransform === "uppercase";

        let currentLine: VisualLine | null = null;
        let currentRun: TextRun | null = null;
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
                                if (!currentLine) currentLine = { runs: [], y: previousY !== -1 ? previousY : 0 };
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
                    currentLine = { runs: [], y: rect.top };
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
     * Render every visual line into the jsPDF document.
     *
     * - Y-spacing between lines is derived directly from the browser Y
     *   coordinates, scaled by `PX_TO_PT`, so the vertical rhythm matches.
     * - Page breaks fire when consecutive lines are separated by more than
     *   `PAGE_BREAK_THRESHOLD` browser pixels.
     * - `referenceEl` is used to derive the page-left edge in browser pixels;
     *   pass the editor element whose content produced `lines`.
     */
    private renderLines(
        doc: jsPDF,
        lines: VisualLine[],
        pageSize: { width: number; height: number },
        options: PDFExportOptions,
        referenceEl: HTMLElement,
        showPageNumbers: boolean = true,
    ): void {
        if (lines.length === 0) return;

        // ── Compute the page-left reference in browser pixels ────────────
        // The first line's first run X minus its CSS-left-offset gives us
        // the page's left edge. We approximate this using the format's
        // known browser margin.
        const format = options.format;
        const marginLeftPx = BROWSER_MARGIN_LEFT[format];

        // Find the first content paragraph to derive the page-left edge
        let referenceLeft = 0;
        for (let i = 2; i < referenceEl.children.length; i++) {
            const child = referenceEl.children[i] as HTMLElement;
            if (child?.tagName === "P") {
                referenceLeft = child.getBoundingClientRect().left;
                break;
            }
        }
        const pageLeftPx = referenceLeft - marginLeftPx;

        let currentY = PAGE_TOP;
        let previousBrowserY = lines[0].y;
        let currentPage = 1;

        for (let li = 0; li < lines.length; li++) {
            const line = lines[li];

            // ── Page break detection ─────────────────────────────────────
            if (li > 0 && line.y - previousBrowserY > PAGE_BREAK_THRESHOLD) {
                // Watermark on the page we are leaving
                if (options.watermark) this.drawWatermark(doc, pageSize, options.author);

                doc.addPage();
                currentPage++;
                currentY = PAGE_TOP;

                // Page number header on pages 2+
                if (showPageNumbers) {
                    this.drawPageHeader(doc, currentPage, pageSize);
                }
            } else if (li > 0) {
                // Advance Y by the scaled browser gap
                currentY += (line.y - previousBrowserY) * PX_TO_PT;
            }

            previousBrowserY = line.y;

            // ── Render every run in this line ────────────────────────────
            // We track `runX` in PDF points; it is initialised from the
            // first run's browser X, then advanced via `getTextWidth` for
            // subsequent runs and pseudo-element injections.
            let runX = -1;
            let isParenOpen = false; // track if first run is the injected "("

            for (let ri = 0; ri < line.runs.length; ri++) {
                const run = line.runs[ri];

                // Determine jsPDF font & style
                const style = jsPDFStyle(run.bold, run.italic);
                doc.setFont(run.fontFamily, style);
                doc.setFontSize(FONT_SIZE);

                // Compute X position
                if (ri === 0 || run.absolutePosition || (ri > 0 && line.runs[ri - 1].absolutePosition)) {
                    // First run, absolute position, or resuming after absolute — use the DOM-measured X
                    runX = (run.x - pageLeftPx) * PX_TO_PT;

                    // Special case: if this is the injected "(" for a
                    // parenthetical, shift it left by one character width
                    // so the real text starts at the correct position.
                    if (run.text === "(" && ri === 0 && !run.absolutePosition) {
                        const parenWidth = doc.getTextWidth("(");
                        runX -= parenWidth;
                        isParenOpen = true;
                    }
                } else if (ri === 1 && isParenOpen) {
                    // The second run after an injected "(" should use its
                    // own DOM X coordinate since the "(" was artificially
                    // prepended.
                    runX = (run.x - pageLeftPx) * PX_TO_PT;
                    isParenOpen = false;
                }
                // For all other runs, runX has already been advanced by
                // the previous iteration's getTextWidth below.

                // Draw text
                doc.setTextColor(0, 0, 0);
                doc.text(run.text, runX, currentY, { baseline: "top" });

                // Draw underline if needed
                if (run.underline) {
                    const tw = doc.getTextWidth(run.text);
                    const underlineY = currentY + FONT_SIZE * 0.95;
                    doc.setDrawColor(0, 0, 0);
                    doc.setLineWidth(0.5);
                    doc.line(runX, underlineY, runX + tw, underlineY);
                }

                // Advance X for the next run
                runX += doc.getTextWidth(run.text);
            }
        }

        // Watermark on the final page
        if (options.watermark) this.drawWatermark(doc, pageSize, options.author);
    }

    // ── Page furniture ───────────────────────────────────────────────────────

    /** Draw the "N." page-number header, right-aligned. */
    private drawPageHeader(doc: jsPDF, pageNumber: number, pageSize: { width: number; height: number }): void {
        if (pageNumber <= 1) return;
        doc.setFont("CourierPrime", "normal");
        doc.setFontSize(FONT_SIZE);
        doc.setTextColor(0, 0, 0);
        const text = `${pageNumber}.`;
        doc.text(text, pageSize.width - PAGE_RIGHT, HEADER_Y, {
            align: "right",
            baseline: "top",
        });
    }

    /** Draw a diagonal watermark across the centre of the current page. */
    private drawWatermark(doc: jsPDF, pageSize: { width: number; height: number }, text: string): void {
        doc.saveGraphicsState();
        doc.setGState(new GState({ opacity: 0.15 }));
        doc.setFont("CourierPrime", "bold");
        doc.setFontSize(54);
        doc.setTextColor(128, 128, 128);
        doc.text(text, pageSize.width / 2, pageSize.height / 2, {
            align: "center",
            baseline: "middle",
            angle: 45,
        });
        doc.restoreGraphicsState();
    }

    // ── Title page ───────────────────────────────────────────────────────────

    /**
     * Render the title page by traversing the title page editor DOM — exactly
     * the same strategy as the screenplay. Returns `true` if any lines were
     * collected and rendered.
     */
    private renderTitlePage(
        doc: jsPDF,
        titlePageEl: HTMLElement,
        pageSize: { width: number; height: number },
        options: PDFExportOptions,
    ): boolean {
        const lines = this.collectLines(titlePageEl, options.format, options);
        if (lines.length === 0) return false;

        this.renderLines(doc, lines, pageSize, options, titlePageEl, false);
        return true;
    }
}
