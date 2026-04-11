import { jsPDF, GState } from "jspdf";
import { getFontForCodePoint, ScriptFont, splitByScript } from "./pdf-utils";

/** A contiguous run of characters sharing the same font and style. */
export interface TextRun {
    text: string;
    x: number; // browser X position in pixels
    fontFamily: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    absolutePosition?: boolean;
    /** When true, x is the right edge — text expands leftward (right-aligned at x). */
    rightAlign?: boolean;
}

/** A single visual line as laid out by the browser. */
export interface VisualLine {
    runs: TextRun[];
    y: number; // browser Y position in pixels (for line-spacing within a page)
    type?: string; // e.g. "dialogue", "character", "scene", "__page_break__"
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
 * All font files to register with jsPDF.
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

/** Font entries grouped by family for lazy loading. */
const FONT_FAMILIES = new Map<string, FontEntry[]>();
for (const entry of FONT_ENTRIES) {
    const list = FONT_FAMILIES.get(entry.family) ?? [];
    list.push(entry);
    FONT_FAMILIES.set(entry.family, list);
}

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
 * Lazily loads font families into jsPDF on first use.
 * When a family is requested, all 4 variants (normal, bold, italic, bolditalic)
 * are fetched and registered in a single batch.
 */
class FontLoader {
    private loaded = new Set<string>();
    private pending = new Map<string, Promise<void>>();

    async ensureFont(doc: jsPDF, family: string, baseUrl: string): Promise<void> {
        if (this.loaded.has(family)) return;
        if (this.pending.has(family)) return this.pending.get(family);

        const entries = FONT_FAMILIES.get(family);
        if (!entries) return;

        const promise = this.loadFamily(doc, entries, baseUrl);
        this.pending.set(family, promise);
        await promise;
        this.loaded.add(family);
        this.pending.delete(family);
    }

    private async loadFamily(doc: jsPDF, entries: FontEntry[], baseUrl: string): Promise<void> {
        const fetched = new Map<string, string>();
        for (const entry of entries) {
            let base64 = fetched.get(entry.filename);
            if (!base64) {
                const response = await fetch(`${baseUrl}/fonts/${entry.filename}`);
                if (!response.ok) {
                    console.warn(`Failed to load font: ${entry.filename}`);
                    continue;
                }
                base64 = arrayBufferToBase64(await response.arrayBuffer());
                fetched.set(entry.filename, base64);
            }
            doc.addFileToVFS(entry.filename, base64);
            doc.addFont(entry.filename, entry.family, entry.style);
        }
    }
}

export type WorkerMessage =
    | { type: "START"; payload: WorkerPayload }
    | { type: "PROGRESS"; progress: number }
    | { type: "DONE"; blob: Blob }
    | { type: "ERROR"; error: string };

export interface WorkerPayload {
    baseUrl: string;
    pageWidth: number; // PDF page width in points
    pageHeight: number; // PDF page height in points
    watermarkText?: string;
    password?: string;
    author: string;
    titlePageLines: VisualLine[];
    titlePageLeftPx: number;
    screenplayLines: VisualLine[];
    screenplayLeftPx: number;
    contdLabel: string;
    moreLabel: string;
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
    if (e.data.type !== "START") return;

    try {
        const payload = e.data.payload;
        const blob = await generatePdf(payload);
        self.postMessage({ type: "DONE", blob });
    } catch (error: any) {
        self.postMessage({ type: "ERROR", error: error.message || String(error) });
    }
};

async function generatePdf(payload: WorkerPayload): Promise<Blob> {
    const pageSize = { width: payload.pageWidth, height: payload.pageHeight };

    // ── Create jsPDF document ────────────────────────────────────────────
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: [pageSize.width, pageSize.height],
        compress: true,
        putOnlyUsedFonts: true,
        ...(payload.password ? { encryption: { userPassword: payload.password } } : {}),
    });

    self.postMessage({ type: "PROGRESS", progress: 5 });

    // Fonts are loaded lazily during rendering — only the families
    // actually used by the screenplay text are fetched.
    const fontLoader = new FontLoader();

    // CourierPrime is always needed for page headers, (MORE)/(CONT'D), and watermarks
    await fontLoader.ensureFont(doc, "CourierPrime", payload.baseUrl);
    doc.setFont("CourierPrime", "normal");
    doc.setFontSize(FONT_SIZE);

    self.postMessage({ type: "PROGRESS", progress: 10 });

    const totalLines = payload.titlePageLines.length + payload.screenplayLines.length;
    let linesProcessed = 0;

    const reportProgress = () => {
        linesProcessed++;
        if (linesProcessed % 50 === 0) {
            const pct = 10 + (linesProcessed / totalLines) * 85;
            self.postMessage({ type: "PROGRESS", progress: pct });
        }
    };

    // ── Render title page (if any) ──────────────────────────────────────
    const hasTitlePage = payload.titlePageLines.length > 0;
    if (hasTitlePage) {
        await renderLines(doc, fontLoader, payload.titlePageLines, pageSize, payload, payload.titlePageLeftPx, false, reportProgress);
        doc.addPage();
    }

    // ── Render screenplay lines ───────────────────────────────────────
    await renderLines(doc, fontLoader, payload.screenplayLines, pageSize, payload, payload.screenplayLeftPx, true, reportProgress);

    self.postMessage({ type: "PROGRESS", progress: 100 });

    return doc.output("blob");
}

/** Find the nearest non-sentinel line before index `li`. */
function findPrevContentLine(lines: VisualLine[], li: number): VisualLine | undefined {
    for (let j = li - 1; j >= 0; j--) {
        if (lines[j].type !== "__page_break__") return lines[j];
    }
    return undefined;
}

/** Find the nearest non-sentinel line after index `li`. */
function findNextContentLine(lines: VisualLine[], li: number): VisualLine | undefined {
    for (let j = li + 1; j < lines.length; j++) {
        if (lines[j].type !== "__page_break__") return lines[j];
    }
    return undefined;
}

async function renderLines(
    doc: jsPDF,
    fontLoader: FontLoader,
    lines: VisualLine[],
    pageSize: { width: number; height: number },
    payload: WorkerPayload,
    pageLeftPx: number,
    showPageNumbers: boolean,
    onLineRendered: () => void,
): Promise<void> {
    if (lines.length === 0) return;

    let currentY = PAGE_TOP;
    let previousBrowserY = -1;
    let currentPage = 1;

    let lastCharacterName = "";
    let lastCharacterX = -1;

    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        onLineRendered();

        // ── Explicit page break sentinel ────────────────────────────
        if (line.type === "__page_break__") {
            const prevLine = findPrevContentLine(lines, li);
            const nextLine = findNextContentLine(lines, li);
            const isDialogueSplit = prevLine?.type === "dialogue" && nextLine?.type === "dialogue";

            // If a dialogue block spans across the page break, draw (MORE) on this page
            if (isDialogueSplit && lastCharacterName) {
                const moreY = currentY + FONT_SIZE * (16 / 12);
                await drawMultiFontText(doc, fontLoader, payload.baseUrl, payload.moreLabel, lastCharacterX, moreY, "left");
            }

            // Watermark on the page we are leaving
            if (payload.watermarkText) drawWatermark(doc, pageSize, payload.watermarkText);

            doc.addPage();
            currentPage++;
            currentY = PAGE_TOP;

            // Page number header on pages 2+
            if (showPageNumbers) {
                drawPageHeader(doc, currentPage, pageSize);
            }

            // Draw Character Name (CONT'D) at the top of the new page
            if (isDialogueSplit && lastCharacterName) {
                // Prevent double CONT'D if the DOM already injected it via `.contd::after`
                const cleanedName = lastCharacterName.replace(payload.contdLabel, "").trim();
                const contdText = `${cleanedName} ${payload.contdLabel}`;
                await drawMultiFontText(doc, fontLoader, payload.baseUrl, contdText, lastCharacterX, currentY, "left");

                currentY += FONT_SIZE * (16 / 12); // Advance Y to make room for dialogue
            }

            // Reset browser Y tracking for the new page
            previousBrowserY = -1;
            continue;
        }

        // ── Line spacing within a page ──────────────────────────────
        if (previousBrowserY !== -1) {
            currentY += (line.y - previousBrowserY) * PX_TO_PT;
        }

        previousBrowserY = line.y;

        // ── Track Character Name ─────────────────────────────────────
        if (line.type === "character" && line.runs.length > 0) {
            lastCharacterName = line.runs.reduce((acc, run) => acc + run.text, "");
            lastCharacterX = (line.runs[0].x - pageLeftPx) * PX_TO_PT;
        }

        // ── Render every run in this line ────────────────────────────
        let isParenOpen = false;
        let lastRunX = -1;
        let lastRunWidth = 0;

        for (let ri = 0; ri < line.runs.length; ri++) {
            const run = line.runs[ri];

            const style = jsPDFStyle(run.bold, run.italic);
            await fontLoader.ensureFont(doc, run.fontFamily, payload.baseUrl);
            doc.setFont(run.fontFamily, style);
            doc.setFontSize(FONT_SIZE);

            // Calculate the absolute X coordinate based on the browser's bounding rect.
            // This prevents "skipped line breaks" causing text to run off the page:
            // if a line is physically wrapped by the browser, its starting element
            // `run.x` will correctly reflect the left margin boundary, automatically
            // resetting the drawing cursor!
            let runX = (run.x - pageLeftPx) * PX_TO_PT;

            // Pseudo-elements injected by pdf-adapter (like the closing parenthesis)
            // are given an x of 0. We must place them relative to the previous run.
            if (run.x === 0 && ri > 0 && lastRunX !== -1) {
                runX = lastRunX + lastRunWidth;
            }

            // Right-aligned runs: x is the right edge, so shift left by text width.
            if (run.rightAlign) {
                runX -= doc.getTextWidth(run.text);
            }

            if (run.text === "(" && ri === 0 && !run.absolutePosition) {
                const parenWidth = doc.getTextWidth("(");
                runX -= parenWidth;
                isParenOpen = true;
            } else if (ri === 1 && isParenOpen) {
                isParenOpen = false;
            }

            doc.setTextColor(0, 0, 0);
            doc.text(run.text, runX, currentY, { baseline: "top" });

            const textWidth = doc.getTextWidth(run.text);
            lastRunX = runX;
            lastRunWidth = textWidth;

            if (run.underline) {
                const underlineY = currentY + FONT_SIZE * 0.95;
                doc.setDrawColor(0, 0, 0);
                doc.setLineWidth(0.5);
                doc.line(runX, underlineY, runX + textWidth, underlineY);
            }
        }
    }

    if (payload.watermarkText) drawWatermark(doc, pageSize, payload.watermarkText);
}

/**
 * Draw a string that may contain characters from multiple scripts, loading
 * the required fonts lazily. Supports "left" and "center" alignment.
 */
async function drawMultiFontText(
    doc: jsPDF,
    fontLoader: FontLoader,
    baseUrl: string,
    text: string,
    x: number,
    y: number,
    align: "left" | "center",
): Promise<void> {
    const segments = splitByScript(text);

    doc.setFontSize(FONT_SIZE);
    doc.setTextColor(0, 0, 0);

    // Pre-load all required fonts so we can measure total width for centering
    for (const seg of segments) {
        const family = seg.font ?? "CourierPrime";
        await fontLoader.ensureFont(doc, family, baseUrl);
    }

    // Compute total width for center alignment
    let totalWidth = 0;
    if (align === "center") {
        for (const seg of segments) {
            doc.setFont(seg.font ?? "CourierPrime", "normal");
            totalWidth += doc.getTextWidth(seg.text);
        }
    }

    let cursorX = align === "center" ? x - totalWidth / 2 : x;
    for (const seg of segments) {
        const family = seg.font ?? "CourierPrime";
        doc.setFont(family, "normal");
        doc.text(seg.text, cursorX, y, { baseline: "top" });
        cursorX += doc.getTextWidth(seg.text);
    }
}

function drawPageHeader(doc: jsPDF, pageNumber: number, pageSize: { width: number; height: number }): void {
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

function drawWatermark(doc: jsPDF, pageSize: { width: number; height: number }, text: string): void {
    doc.saveGraphicsState();
    doc.setGState(new GState({ opacity: 0.15 }));
    doc.setFont("CourierPrime", "bold");
    doc.setTextColor(128, 128, 128);

    // Scale font size so the text spans the page diagonal (with margin).
    const diagonal = Math.sqrt(pageSize.width ** 2 + pageSize.height ** 2);
    const maxTextWidth = diagonal - 2 * PAGE_RIGHT;
    // Measure at a reference size, then scale proportionally.
    const refSize = 54;
    doc.setFontSize(refSize);
    const refWidth = doc.getTextWidth(text);
    const fontSize = Math.min((maxTextWidth / refWidth) * refSize, 120);
    doc.setFontSize(fontSize);

    const textWidth = doc.getTextWidth(text);
    const cx = pageSize.width / 2;
    const cy = pageSize.height / 2;
    // Rotation angle matches the page diagonal so the text runs corner-to-corner.
    const angle = Math.atan2(pageSize.height, pageSize.width) * (180 / Math.PI);
    const rad = angle * (Math.PI / 180);
    // Offset by half the text height along the perpendicular to compensate
    // for the baseline sitting at the top of the glyphs.
    const textHeight = fontSize * 0.75; // approximate ascent in points
    const x0 = cx - (textWidth / 2) * Math.cos(rad) + (textHeight / 2) * Math.sin(rad);
    const y0 = cy + (textWidth / 2) * Math.sin(rad) + (textHeight / 2) * Math.cos(rad);

    doc.text(text, x0, y0, { angle });
    doc.restoreGraphicsState();
}
