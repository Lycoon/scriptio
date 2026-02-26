import { jsPDF, GState } from "jspdf";
import { PageFormat } from "@src/lib/utils/enums";
import { getFontForCodePoint, ScriptFont } from "./pdf-utils";

/** A contiguous run of characters sharing the same font and style. */
export interface TextRun {
    text: string;
    x: number; // browser X position in pixels
    fontFamily: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    absolutePosition?: boolean;
}

/** A single visual line as laid out by the browser. */
export interface VisualLine {
    runs: TextRun[];
    y: number; // browser Y position in pixels (for page-break detection)
    type?: string; // e.g. "dialogue", "character", "scene"
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

export type WorkerMessage =
    | { type: "START"; payload: WorkerPayload }
    | { type: "PROGRESS"; progress: number }
    | { type: "DONE"; blob: Blob }
    | { type: "ERROR"; error: string };

export interface WorkerPayload {
    baseUrl: string;
    format: PageFormat;
    watermark: boolean;
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
    const pageSize = PDF_PAGE_SIZES[payload.format];

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

    // ── Load & register every font variant ──────────────────────────────
    await loadFonts(doc, payload.baseUrl, (p) => {
        self.postMessage({ type: "PROGRESS", progress: p });
    });

    self.postMessage({ type: "PROGRESS", progress: 20 });

    doc.setFont("CourierPrime", "normal");
    doc.setFontSize(FONT_SIZE);

    const totalLines = payload.titlePageLines.length + payload.screenplayLines.length;
    let linesProcessed = 0;

    const reportProgress = () => {
        linesProcessed++;
        // Scale remaining progress between 20% and 95%
        if (linesProcessed % 50 === 0) {
            const pct = 20 + (linesProcessed / totalLines) * 75;
            self.postMessage({ type: "PROGRESS", progress: pct });
        }
    };

    // ── Render title page (if any) ──────────────────────────────────────
    const hasTitlePage = payload.titlePageLines.length > 0;
    if (hasTitlePage) {
        renderLines(doc, payload.titlePageLines, pageSize, payload, payload.titlePageLeftPx, false, reportProgress);
        doc.addPage();
    }

    // ── Render screenplay lines ───────────────────────────────────────
    renderLines(doc, payload.screenplayLines, pageSize, payload, payload.screenplayLeftPx, true, reportProgress);

    self.postMessage({ type: "PROGRESS", progress: 100 });

    return doc.output("blob");
}

async function loadFonts(doc: jsPDF, baseUrl: string, progressCallback: (p: number) => void): Promise<void> {
    const fetchedFiles = new Map<string, string>();
    const totalFonts = FONT_ENTRIES.length;
    let loadedFonts = 0;

    for (const entry of FONT_ENTRIES) {
        let base64 = fetchedFiles.get(entry.filename);
        if (!base64) {
            const url = `${baseUrl}/fonts/${entry.filename}`;
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`Failed to load font: ${url}`);
                loadedFonts++;
                continue;
            }
            const buffer = await response.arrayBuffer();
            base64 = arrayBufferToBase64(buffer);
            fetchedFiles.set(entry.filename, base64);
        }

        doc.addFileToVFS(entry.filename, base64);
        doc.addFont(entry.filename, entry.family, entry.style);

        loadedFonts++;
        // Scale loading fonts progress from 5% to 20%
        progressCallback(5 + (loadedFonts / totalFonts) * 15);
    }
}

function renderLines(
    doc: jsPDF,
    lines: VisualLine[],
    pageSize: { width: number; height: number },
    payload: WorkerPayload,
    pageLeftPx: number,
    showPageNumbers: boolean,
    onLineRendered: () => void,
): void {
    if (lines.length === 0) return;

    let currentY = PAGE_TOP;
    let previousBrowserY = lines[0].y;
    let currentPage = 1;

    let lastCharacterName = "";
    let lastCharacterRuns: TextRun[] = [];

    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        onLineRendered();

        // ── Page break detection ─────────────────────────────────────
        if (li > 0 && line.y - previousBrowserY > PAGE_BREAK_THRESHOLD) {
            const isDialogueSplit = lines[li - 1].type === "dialogue" && line.type === "dialogue";

            // If a dialogue block spans across the page break, draw (MORE) on this page
            if (isDialogueSplit && lastCharacterName) {
                doc.setFont("CourierPrime", "normal");
                doc.setFontSize(FONT_SIZE);
                doc.setTextColor(0, 0, 0);

                // Center (MORE) horizontally on the page
                const moreX = pageSize.width / 2;

                // Draw (MORE) one line below the last line
                const moreY = currentY + FONT_SIZE * (17 / 12); // Approximate line-height conversion
                doc.text(payload.moreLabel, moreX, moreY, { align: "center", baseline: "top" });
            }

            // Watermark on the page we are leaving
            if (payload.watermark) drawWatermark(doc, pageSize, payload.author);

            doc.addPage();
            currentPage++;
            currentY = PAGE_TOP;

            // Page number header on pages 2+
            if (showPageNumbers) {
                drawPageHeader(doc, currentPage, pageSize);
            }

            // Draw Character Name (CONT'D) at the top of the new page
            if (isDialogueSplit && lastCharacterName) {
                // Find the indent of the character name
                let charX = 0;
                if (lastCharacterRuns.length > 0) {
                    charX = (lastCharacterRuns[0].x - pageLeftPx) * PX_TO_PT;

                    const style = jsPDFStyle(lastCharacterRuns[0].bold, lastCharacterRuns[0].italic);
                    doc.setFont(lastCharacterRuns[0].fontFamily, style);
                } else {
                    doc.setFont("CourierPrime", "normal");
                    charX = doc.getTextWidth("      "); // fallback
                }

                doc.setFontSize(FONT_SIZE);
                doc.setTextColor(0, 0, 0);

                // Center the contd text horizontally on the page
                // Prevent double CONT'D if the DOM already injected it via `.contd::after`
                const cleanedName = lastCharacterName.replace(payload.contdLabel, "").trim();
                const contdText = `${cleanedName} ${payload.contdLabel}`;
                const contdX = pageSize.width / 2;
                doc.text(contdText, contdX, currentY, { align: "center", baseline: "top" });

                currentY += FONT_SIZE * (17 / 12); // Advance Y to make room for dialogue
            }
        } else if (li > 0) {
            // Advance Y by the scaled browser gap
            currentY += (line.y - previousBrowserY) * PX_TO_PT;
        }

        previousBrowserY = line.y;

        // ── Track Character Name ─────────────────────────────────────
        if (line.type === "character" && line.runs.length > 0) {
            lastCharacterName = line.runs.reduce((acc, run) => acc + run.text, "");
            lastCharacterRuns = line.runs; // Save for font/pos recreation
        }

        // ── Render every run in this line ────────────────────────────
        let isParenOpen = false;
        let lastRunX = -1;
        let lastRunWidth = 0;

        for (let ri = 0; ri < line.runs.length; ri++) {
            const run = line.runs[ri];

            const style = jsPDFStyle(run.bold, run.italic);
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

    if (payload.watermark) drawWatermark(doc, pageSize, payload.author);
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
    doc.setFontSize(54);
    doc.setTextColor(128, 128, 128);
    doc.text(text, pageSize.width / 2, pageSize.height / 2, {
        align: "center",
        baseline: "middle",
        angle: 45,
    });
    doc.restoreGraphicsState();
}
