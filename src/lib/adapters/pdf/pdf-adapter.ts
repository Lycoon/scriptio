
import { BaseExportOptions, ProjectAdapter } from "../screenplay-adapter";
import { ProjectData, ProjectState } from "@src/lib/project/project-state";
import { ExportFormat, PageFormat } from "@src/lib/utils/enums";
import { getFontForCodePoint, ScriptFont } from "./pdf-utils";
import type { TextRun } from "./pdf.worker";
import { BASE_URL } from "@src/lib/utils/constants";
import { PAGE_SIZES } from "@src/lib/screenplay/extensions/pagination-extension";
import { revisionColor } from "@src/lib/screenplay/revisions";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PDFExportOptions = BaseExportOptions & {
    format: PageFormat;
    watermarkText?: string;
    password?: string;
    displaySceneNumbers?: boolean;
    sceneHeadingBold?: boolean;
    sceneHeadingSpacing?: number;
    sceneNumberOnRight?: boolean;
    contdLabel?: string;
    moreLabel?: string;
    /** Append the CONT'D label to a character cue resuming after an
     *  interruption. Defaults to on when omitted. */
    showContdDialogue?: boolean;
    /** Draw the MORE / CONT'D pair around dialogue split by a page break.
     *  Defaults to on when omitted. */
    showContdPageBreak?: boolean;
    editorElement?: HTMLElement;
    titlePageElement?: HTMLElement;
    /** How production revisions are rendered into the PDF (see {@link RevisionExportMode}). */
    revisionExport?: RevisionExportMode;
    /** Which pages to export. Absent (or omitted) means every page.
     *  - `ranges`: keep pages whose 1-based ordinal falls in any [start, end].
     *  - `revisions`: keep pages that carry a change stamped with one of the
     *     given revision indices (a production "revised pages" distribution). */
    pageSelection?: PageSelection;
};

export type PageSelection =
    | { mode: "ranges"; ranges: Array<[number, number]> }
    | { mode: "revisions"; revisions: number[] };

/**
 * What of the production revisions ends up in an exported PDF:
 *  - `none`    — a clean shooting script: no asterisks and no revision tinting,
 *                whatever the editor currently displays.
 *  - `colored` — changed text in its revision colour + a matching coloured
 *                right-margin asterisk on every revised visual line.
 *  - `bw`      — the same revision marks (asterisks + the changed runs) but all
 *                in black, for a black & white revised distribution.
 */
export type RevisionExportMode = "none" | "colored" | "bw";

import type { WorkerMessage, WorkerPayload, VisualLine, PageHeader, PageFooter } from "./pdf.worker";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Scale factor from browser pixels (96 DPI) to PDF points (72 DPI). */
const PX_TO_PT = 72 / 96;

/** PDF page dimensions in points, derived from pagination-extension pixel sizes. */
const PDF_PAGE_SIZES: Record<PageFormat, { width: number; height: number }> = {
    LETTER: { width: PAGE_SIZES.LETTER.pageWidth * PX_TO_PT, height: PAGE_SIZES.LETTER.pageHeight * PX_TO_PT },
    A4: { width: PAGE_SIZES.A4.pageWidth * PX_TO_PT, height: PAGE_SIZES.A4.pageHeight * PX_TO_PT },
};

/** Display-only declarations the measurement pass overrides on each editor and
 *  restores afterwards — see {@link PDFAdapter.withCanonicalLayout}. */
const CANONICAL_PINNED_PROPERTIES = ["transform", "width", "--display-margin-scale"] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map a `ScriptFont` value to the jsPDF font-family name. */
const fontFamilyFor = (sf: ScriptFont): string => sf ?? "CourierPrime";

/**
 * Read the computed style of a text node's parent element and determine
 * whether bold, italic, or underline is active.
 *
 * Using `getComputedStyle` captures both TipTap inline marks (`<span class="bold">`)
 * and paragraph-level styling (e.g. `.scene { font-weight: bold }`).
 *
 * `bold`/`italic` are inherited CSS properties, so the direct parent's computed
 * value already reflects every ancestor. `text-decoration-line` is NOT inherited,
 * so underline is resolved by walking the ancestor chain up to the paragraph and
 * skipping `.spellcheck-error` decoration spans — their wavy red underline is an
 * editor-only affordance that must never bleed into exports, while a real
 * underline on a wrapping mark or on the paragraph itself (e.g. `.section`) is
 * still honoured.
 */
const getMarksFromComputedStyle = (textNode: Text): { bold: boolean; italic: boolean; underline: boolean } => {
    const el = textNode.parentElement;
    if (!el) return { bold: false, italic: false, underline: false };
    const cs = getComputedStyle(el);

    let underline = false;
    let node: HTMLElement | null = el;
    while (node) {
        if (!node.classList.contains("spellcheck-error")) {
            const style = node === el ? cs : getComputedStyle(node);
            if (style.textDecorationLine.includes("underline")) {
                underline = true;
                break;
            }
        }
        if (node.tagName === "P") break; // reached the paragraph block
        node = node.parentElement;
    }

    return {
        bold: cs.fontWeight === "bold" || parseInt(cs.fontWeight) >= 700,
        italic: cs.fontStyle === "italic",
        underline,
    };
};

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class PDFAdapter extends ProjectAdapter<PDFExportOptions> {
    label = "PDF";
    exportTarget = { format: ExportFormat.PDF, extension: "pdf" };

    // Export-only: a PDF carries no recoverable screenplay structure, so nothing
    // routes `.pdf` files here (`convertFrom` throws).
    importExtensions = [];

    async convertTo(_project: ProjectState, options: PDFExportOptions): Promise<Blob> {
        const editorEl = options.editorElement;
        if (!editorEl) throw new Error("Editor element is required for DOM-based PDF export");

        const format = options.format;
        const pdfPageSize = PDF_PAGE_SIZES[format];

        // Scene labels (under production lock) and OMITTED state are already
        // rendered as ProseMirror decoration widgets inside each scene <p>.
        // `collectLines` reads them directly from the DOM, so we don't need to
        // re-run the scene-labeling logic here.

        // ── Collect all visual lines from the browser DOM ───────────────────
        const titlePageEl = options.titlePageElement;

        // Every coordinate below comes from the live DOM, so the whole geometry
        // pass runs with the editor's display-only layout neutralised — see
        // `withCanonicalLayout`. Keeping it in a single closure means the layout
        // is pinned (and restored) exactly once per export.
        const measured = this.withCanonicalLayout([editorEl, titlePageEl], () => {
            // Header/footer columns are laid out within the configured page
            // margins: the editor's `.pagination-header-area` /
            // `.pagination-footer-area` are padded by
            // --page-margin-left/right. Read those margins (px) off the editor
            // DOM and convert to PDF points so the export reproduces the same
            // horizontal bounds instead of a hard-coded 1-inch margin.
            const editorStyle = getComputedStyle(editorEl);
            const readMarginPt = (name: string, fallbackPx: number): number => {
                const px = parseFloat(editorStyle.getPropertyValue(name));
                return (Number.isFinite(px) ? px : fallbackPx) * PX_TO_PT;
            };

            // Footer of the final page: it has no trailing page-break sentinel
            // to carry it, so it is read from the dedicated last-page widget.
            // Page filtering below re-derives it from the last surviving page.
            const lastPageWidget = editorEl.querySelector(".pagination-last-page") as HTMLElement | null;
            // Header of the (otherwise unnumbered) first page, read from the
            // first-page pagination widget. Blank unless "Show first page
            // header" is on, in which case its spans carry the expanded
            // templates.
            const firstPageWidget = editorEl.querySelector(".pagination-first-page") as HTMLElement | null;

            return {
                titlePageLines: titlePageEl ? this.collectLines(titlePageEl, options) : [],
                titlePageLeftPx: titlePageEl ? this.getPageLeftPx(titlePageEl) : 0,
                screenplayLines: this.collectLines(editorEl, options),
                screenplayLeftPx: this.getPageLeftPx(editorEl),
                screenplayLastFooter: lastPageWidget ? this.extractFooter(lastPageWidget) : undefined,
                screenplayFirstHeader: firstPageWidget ? this.extractHeader(firstPageWidget) : undefined,
                pageMarginLeft: readMarginPt("--page-margin-left", 96),
                pageMarginRight: readMarginPt("--page-margin-right", 96),
            };
        });

        const { titlePageLines, titlePageLeftPx, screenplayLeftPx, screenplayFirstHeader, pageMarginLeft, pageMarginRight } =
            measured;
        let screenplayLines = measured.screenplayLines;
        let screenplayLastFooter = measured.screenplayLastFooter;

        // Page selection: keep only the chosen pages (by range or by revision).
        const sel = options.pageSelection;
        if (sel?.mode === "ranges" && sel.ranges.length > 0) {
            const kept = this.keepPages(screenplayLines, screenplayLastFooter, (_page, ordinal) =>
                sel.ranges.some(([start, end]) => ordinal >= start && ordinal <= end),
            );
            screenplayLines = kept.lines;
            screenplayLastFooter = kept.lastFooter;
        } else if (sel?.mode === "revisions" && sel.revisions.length > 0) {
            const wanted = new Set(sel.revisions);
            const kept = this.keepPages(screenplayLines, screenplayLastFooter, (page) => {
                for (const r of page.revisions) if (wanted.has(r)) return true;
                return false;
            });
            screenplayLines = kept.lines;
            screenplayLastFooter = kept.lastFooter;
        }
        this.applyRevisionStyling(screenplayLines, options.revisionExport ?? "colored");

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
                pageWidth: pdfPageSize.width,
                pageHeight: pdfPageSize.height,
                watermarkText: options.watermarkText,
                password: options.password,
                author: options.author,
                titlePageLines,
                titlePageLeftPx,
                screenplayLines,
                screenplayLeftPx,
                screenplayFirstHeader,
                screenplayLastFooter,
                pageMarginLeft,
                pageMarginRight,
                contdLabel: options.contdLabel ?? "(CONT'D)",
                moreLabel: options.moreLabel ?? "(MORE)",
                showContdPageBreak: options.showContdPageBreak !== false,
            };

            worker.postMessage({ type: "START", payload });
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    convertFrom(_: ArrayBuffer): Partial<ProjectData> {
        throw new Error("Method not implemented.");
    }

    // ── Canonical (page-shaped) measurement ─────────────────────────────────

    /**
     * Run `measure` with the editors' display-only layout pinned to the
     * canonical page, so every DOM coordinate it reads is the real page
     * geometry rather than whatever the current screen renders.
     *
     * Two phone view modes deform that geometry, and both feed straight into
     * `getBoundingClientRect()` / `Range.getClientRects()`, the only source of
     * coordinates in this exporter:
     *
     *  - PAGED: the page is scaled to fit the viewport — `transform:
     *    scale(var(--editor-zoom))`. Left in place, a 0.48× fit shrinks every X
     *    offset and line gap by half while the PDF still draws a fixed 12pt
     *    font.
     *  - ENDLESS: there is no page rectangle at all — the editor is widened to
     *    the viewport (`width: 100%`) and the screenplay margins are compressed
     *    to `--display-margin-scale: 0.3` so text reflows large on a narrow
     *    screen (see EditorPanel.module.css). Left in place, the export keeps
     *    those compressed margins and the viewport's much earlier line wrapping
     *    — the layout of the PDF is then the phone's, not the page's.
     *
     * So both are neutralised here: the scale is dropped, the margins go back
     * to 1×, and the editor is widened back to `--page-width` (the same custom
     * property the pagination stylesheet sizes the page from, left untouched by
     * either mode; skipped if it isn't set, rather than collapsing the element
     * to `width: auto`).
     *
     * Pinning the layout is preferred over correcting the measurements after
     * the fact: `getComputedStyle` lengths (which this pass also reads) don't
     * follow the transform, so scale and margins would need opposite
     * corrections. Overrides are set `!important` so no stylesheet rule can
     * outvote them, and the original inline declarations are restored
     * afterwards.
     *
     * The hidden page-break widgets of endless mode need no such treatment:
     * `collectLines` finds them by class whatever their `display`, and the
     * worker resets its Y cursor to the top of the page on every break, so the
     * gap those widgets would have occupied is never read.
     *
     * Nothing here yields to the event loop, so the browser never paints the
     * pinned state — the export is invisible to the user. Scroll offsets are
     * restored explicitly, since re-shaping the page changes the layout box and
     * can clamp the scroll position of every scrollable ancestor.
     */
    private withCanonicalLayout<T>(elements: (HTMLElement | undefined)[], measure: () => T): T {
        const targets = elements.filter((el): el is HTMLElement => !!el);
        const savedStyles = targets.map((el) => ({
            el,
            declarations: CANONICAL_PINNED_PROPERTIES.map((name) => ({
                name,
                value: el.style.getPropertyValue(name),
                priority: el.style.getPropertyPriority(name),
            })),
        }));

        const savedScroll = new Map<Element, { top: number; left: number }>();
        for (const el of targets) {
            let node: Element | null = el;
            while (node) {
                if (!savedScroll.has(node)) savedScroll.set(node, { top: node.scrollTop, left: node.scrollLeft });
                node = node.parentElement;
            }
        }

        try {
            for (const el of targets) {
                // Both writers of --page-width (the pagination extension's
                // syncVars and the editor wrapper's inline style) emit px, so
                // anything else is not a length to pin to — leave the width as
                // it is rather than guess at it.
                const rawPageWidth = getComputedStyle(el).getPropertyValue("--page-width").trim();
                const pageWidthPx = rawPageWidth.endsWith("px") ? parseFloat(rawPageWidth) : NaN;
                el.style.setProperty("transform", "none", "important");
                el.style.setProperty("--display-margin-scale", "1", "important");
                if (Number.isFinite(pageWidthPx) && pageWidthPx > 0) {
                    el.style.setProperty("width", `${pageWidthPx}px`, "important");
                }
            }
            // No explicit reflow needed: the first geometry read inside
            // `measure` flushes the pending layout for us.
            return measure();
        } finally {
            for (const saved of savedStyles) {
                for (const { name, value, priority } of saved.declarations) {
                    // Always clear first: WebKit ignores a `setProperty` that
                    // lowers a custom property's priority, so overwriting the
                    // `!important` pin in place would leave the editor stuck at
                    // the canonical value (a 1× margin scale on a phone).
                    saved.el.style.removeProperty(name);
                    if (value) saved.el.style.setProperty(name, value, priority);
                }
            }
            // Assigning scroll offsets flushes the restored layout first, so
            // these land against the on-screen extents they were taken from.
            for (const [node, pos] of savedScroll) {
                node.scrollTop = pos.top;
                node.scrollLeft = pos.left;
            }
        }
    }

    // ── DOM → VisualLine[] ───────────────────────────────────────────────────

    /**
     * Walk the editor DOM and build a flat list of `VisualLine`s — one per
     * visual text line as laid out by the browser.
     *
     * Page breaks are detected by looking for `.pagination-page-break` widget
     * elements — both as direct children of the editor and nested inside `<p>`
     * elements (for mid-node sentence splits). Each detected break emits a
     * `__page_break__` sentinel line that the worker handles explicitly.
     */
    private collectLines(editorEl: HTMLElement, options: PDFExportOptions): VisualLine[] {
        const allLines: VisualLine[] = [];
        let sceneCount = 0;
        let yOffset = 0;

        for (let i = 0; i < editorEl.children.length; i++) {
            const el = editorEl.children[i] as HTMLElement;
            if (!el) continue;

            // ── Direct-child pagination widget → explicit page break ──
            if (el.classList.contains("pagination-page-break")) {
                allLines.push({
                    runs: [],
                    y: 0,
                    type: "__page_break__",
                    pageLabel: this.extractPageLabel(el),
                    header: this.extractHeader(el),
                    footer: this.extractFooter(el),
                });
                continue;
            }

            // ── Dual dialogue container ──
            if (el.classList.contains("dual_dialogue")) {
                // Each column paragraph stamps its own revised lines; the
                // container only carries the fallback attribute.
                const ddLines = this.collectDualDialogueLines(el, options, yOffset);
                this.stampNodeRevision(el, [ddLines]);
                allLines.push(...ddLines);
                continue;
            }

            // Skip all non-<p> elements (pagination-first-page, pagination-last-page, etc.)
            if (el.tagName !== "P") continue;

            const isScene = el.classList.contains("scene");
            if (isScene) sceneCount++;
            // Label widgets are injected by `scene-locking-extension` when
            // production lock is on. Read whichever side is present (left or
            // right) and fall back to a positional number when neither is.
            const sceneInfo = isScene
                ? {
                      label:
                          (el.querySelector(".scene-label-left") as HTMLElement | null)?.textContent
                              ?.trim() ||
                          (el.querySelector(".scene-label-right") as HTMLElement | null)?.textContent
                              ?.trim() ||
                          String(sceneCount),
                  }
                : undefined;

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

            // ── Check for mid-node split (pagination widget inside <p>) ──
            // Note: do NOT use ":scope >" here — when a mark (bold/italic/underline) wraps
            // across the page break, the widget is nested inside the mark's element, not a
            // direct child of <p>. The positional split in collectParagraphLines uses
            // compareDocumentPosition which works correctly at any nesting depth.
            const splitWidget = el.querySelector(".pagination-page-break") as HTMLElement | null;

            if (splitWidget) {
                // Collect lines BEFORE the split widget
                const beforeLines = this.collectParagraphLines(el, nodeType, splitWidget, "before");
                if (beforeLines.length > 0) {
                    if (yOffset > 0) {
                        for (const line of beforeLines) line.y -= yOffset;
                    }
                    this.injectPseudoContent(el, beforeLines, options, sceneInfo);
                    allLines.push(...beforeLines);
                }

                // Emit page break sentinel
                allLines.push({
                    runs: [],
                    y: 0,
                    type: "__page_break__",
                    pageLabel: this.extractPageLabel(splitWidget),
                    header: this.extractHeader(splitWidget),
                });

                // Collect lines AFTER the split widget
                const afterLines = this.collectParagraphLines(el, nodeType, splitWidget, "after");
                if (afterLines.length > 0) {
                    if (yOffset > 0) {
                        for (const line of afterLines) line.y -= yOffset;
                    }
                    allLines.push(...afterLines);
                }

                // Both halves are already in `allLines`, but they are the same
                // objects — the attribute fallback can still stamp the node's
                // first line whichever side of the break it fell on.
                this.stampNodeRevision(el, [beforeLines, afterLines]);
            } else {
                const paragraphLines = this.collectParagraphLines(el, nodeType);

                if (paragraphLines.length > 0) {
                    // Apply yOffset to close physical gaps from entirely skipped text nodes
                    if (yOffset > 0) {
                        for (const line of paragraphLines) line.y -= yOffset;
                    }
                    // ── Pseudo-element content (not captured by TreeWalker) ──
                    this.injectPseudoContent(el, paragraphLines, options, sceneInfo);
                    this.stampNodeRevision(el, [paragraphLines]);
                    allLines.push(...paragraphLines);
                } else {
                    // Empty paragraph — no text nodes, so collectParagraphLines
                    // returns nothing. We still emit a zero-run VisualLine at
                    // the paragraph's browser Y position so that renderLines
                    // advances Y by exactly one line height and does NOT
                    // misinterpret the accumulated gap as a page break.
                    const rect = el.getBoundingClientRect();
                    if (rect.height > 0) {
                        const emptyLine: VisualLine = { runs: [], y: rect.top - yOffset, type: nodeType };
                        this.stampNodeRevision(el, [[emptyLine]]);
                        allLines.push(emptyLine);
                    }
                }
            }
        }

        return allLines;
    }

    /**
     * Collect `VisualLine`s from a `dual_dialogue` container.
     *
     * Each column is a flex child rendered side by side. The browser Range API
     * already returns absolute X positions for characters in both columns, so
     * after subtracting `pageLeftPx` in the worker they land at the correct
     * PDF X positions without any special logic.
     *
     * Lines from both columns are merged and sorted by Y so that lines at the
     * same vertical position (same row across both columns) are contiguous.
     */
    private collectDualDialogueLines(
        dualDialogueEl: HTMLElement,
        options: PDFExportOptions,
        yOffset: number,
    ): VisualLine[] {
        const columnLines: VisualLine[] = [];
        const elementClasses = ["character", "dialogue", "parenthetical"];

        const columns = dualDialogueEl.querySelectorAll(":scope > .dual_dialogue_column");
        for (let ci = 0; ci < columns.length; ci++) {
            const column = columns[ci] as HTMLElement;

            for (let pi = 0; pi < column.children.length; pi++) {
                const p = column.children[pi] as HTMLElement;
                if (p.tagName !== "P") continue;

                let nodeType: string | undefined;
                for (const cls of elementClasses) {
                    if (p.classList.contains(cls)) { nodeType = cls; break; }
                }

                const paragraphLines = this.collectParagraphLines(p, nodeType);
                if (paragraphLines.length > 0) {
                    if (yOffset > 0) {
                        for (const line of paragraphLines) line.y -= yOffset;
                    }
                    this.injectPseudoContent(p, paragraphLines, options);
                    this.stampNodeRevision(p, [paragraphLines]);
                    columnLines.push(...paragraphLines);
                } else {
                    // Empty paragraph — emit a spacer line so Y advances correctly.
                    const rect = p.getBoundingClientRect();
                    if (rect.height > 0) {
                        const emptyLine: VisualLine = { runs: [], y: rect.top - yOffset, type: nodeType };
                        this.stampNodeRevision(p, [[emptyLine]]);
                        columnLines.push(emptyLine);
                    }
                }
            }
        }

        // Interleave left and right column lines by their visual Y position.
        columnLines.sort((a, b) => a.y - b.y);
        return columnLines;
    }

    /**
     * For a single `<p>` element, iterate character-by-character using the
     * Range API to detect the exact browser line breaks and build
     * `VisualLine` objects.
     *
     * When `splitAt` / `splitSide` are provided, only text nodes on the
     * specified side of the split widget are collected (used for mid-node
     * sentence splits where a pagination widget sits inside the `<p>`).
     */
    private collectParagraphLines(
        el: HTMLElement,
        type?: string,
        splitAt?: HTMLElement,
        splitSide?: "before" | "after",
    ): VisualLine[] {
        const lines: VisualLine[] = [];
        const range = document.createRange();

        // TreeWalker with filter to skip text nodes inside decoration widgets
        // (pagination widgets, collab carets, bookmark markers) but allow text
        // inside title page format atom nodes (contentEditable="false" spans
        // with data-tp-type) through.
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
            acceptNode(node: Node) {
                let parent = (node as Text).parentElement;
                while (parent && parent !== el) {
                    if (parent.contentEditable === "false" && !parent.hasAttribute("data-tp-type")) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    parent = parent.parentElement;
                }
                return NodeFilter.FILTER_ACCEPT;
            },
        });

        // Whether the paragraph applies text-transform: uppercase
        const uppercase = getComputedStyle(el).textTransform === "uppercase";

        let currentLine: VisualLine | null = null;
        let currentRun: TextRun | null = null;
        let previousY = -1;

        let textNode: Text | null;
        while ((textNode = walker.nextNode() as Text | null)) {
            // Filter by split side using document position relative to the widget
            if (splitAt && splitSide) {
                const pos = splitAt.compareDocumentPosition(textNode);
                if (splitSide === "before" && !(pos & Node.DOCUMENT_POSITION_PRECEDING)) continue;
                if (splitSide === "after" && !(pos & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
            }

            const text = textNode.nodeValue!;
            if (!text) continue;

            // Resolve marks once per text node (they don't change mid-node)
            const marks = getMarksFromComputedStyle(textNode);
            // Revision mark covering this text node, if any — read straight from
            // the `revision` mark span so it's independent of the editor's
            // current display mode (which only tints, it never removes the
            // attribute). `lineRevision` marks the visual line the characters
            // land on (asterisk); `revision` additionally tints the run, so a
            // deletion anchor — an invisible marker riding a surviving
            // character — is excluded from it.
            const { index: lineRevision, isDel } = this.readRevisionMark(textNode, el);
            const revision = isDel ? 0 : lineRevision;

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
                    currentRun.revision === revision;

                // ── Measure position ─────────────────────────────────────
                range.setStart(textNode, ci);
                range.setEnd(textNode, ci + 1);
                // WebKit (Safari, Tauri on macOS) has a long-standing quirk:
                // for the FIRST character of a wrapped line, the single-char
                // range straddles a line boundary because position `ci` is
                // bidi-ambiguous between the end of the previous line and the
                // start of the new one. `getBoundingClientRect()` returns the
                // UNION of both lines — `rect.top` then lands on the *previous*
                // line, so we mistakenly attribute the char to it. The visible
                // result in PDFs is "one letter at the end of every wrapped
                // line plus a leading space on the next".
                //
                // `getClientRects()` returns one rect per line box the range
                // intersects; the LAST rect is always the actual rendering
                // line. For normal (single-line) chars only one rect is
                // returned, so this is a no-op everywhere else.
                const rects = range.getClientRects();
                const rect = rects.length > 0
                    ? rects[rects.length - 1]
                    : range.getBoundingClientRect();

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
                                revision,
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

                // Asterisk stamping: only the visual lines a revision mark
                // actually lands on are revised — matching the editor overlay,
                // which measures the marked range's client rects line by line.
                // Zero-height chars (trailing wrapped spaces) never get here, so
                // they can't stamp the line they were laid out on, exactly as
                // the overlay skips their empty rects.
                if (lineRevision >= 1 && lineRevision > (currentLine.revision ?? 0)) {
                    currentLine.revision = lineRevision;
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
                        revision,
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
        sceneInfo?: { label: string },
    ): void {
        const firstLine = paragraphLines[0];
        const lastLine = paragraphLines[paragraphLines.length - 1];

        if (sceneInfo && options.displaySceneNumbers) {
            const elStyle = getComputedStyle(el);
            const paddingLeft = parseFloat(elStyle.paddingLeft) || 0;

            // Left scene number — mirrors CSS `right: 100%; margin-right: -120px`
            // on .scene::before: right edge lands at scene_element_left + 120px.
            if (firstLine.runs.length > 0) {
                const leadRun = firstLine.runs[0];
                firstLine.runs.unshift({
                    text: sceneInfo.label,
                    x: leadRun.x - paddingLeft + 120,
                    fontFamily: leadRun.fontFamily,
                    bold: leadRun.bold,
                    italic: leadRun.italic,
                    underline: leadRun.underline,
                    absolutePosition: true,
                    rightAlign: true,
                });
            }

            // Right scene number — mirrors CSS `left: 100%; margin-left: -85px`
            // on .scene::after: left edge lands at scene_element_right - 85px.
            if (options.sceneNumberOnRight && firstLine.runs.length > 0) {
                const tailRun = firstLine.runs[firstLine.runs.length - 1];
                firstLine.runs.push({
                    text: sceneInfo.label,
                    x: el.getBoundingClientRect().right - 85,
                    fontFamily: tailRun.fontFamily,
                    bold: tailRun.bold,
                    italic: tailRun.italic,
                    underline: tailRun.underline,
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

        if (el.classList.contains("contd") && options.showContdDialogue !== false) {
            const label = options.contdLabel ?? "(CONT'D)";
            if (lastLine.runs.length > 0) {
                const tailRun = lastLine.runs[lastLine.runs.length - 1];
                tailRun.text += " " + label;
            }
        }
    }

    /**
     * Read the user-visible page label out of a `.pagination-page-break`
     * widget. The widget renders its destination page's header inside
     * `.pagination-header-area > .pagination-header-right` (the configured
     * headerRight template, with `{page}` already substituted) — so the
     * textContent IS the final label string the user sees. Under page
     * locking this string is the frozen "4A." form; otherwise it's the
     * default sequential "4.". Returns undefined when no header is
     * present so the worker falls back to its integer pageNumber.
     */
    private extractPageLabel(widget: HTMLElement): string | undefined {
        const right = widget.querySelector(
            ".pagination-header-area .pagination-header-right",
        ) as HTMLElement | null;
        if (!right) return undefined;
        return right.textContent?.trim() ?? undefined;
    }

    /**
     * Read the page's three header columns (left / middle / right) out of a
     * `.pagination-page-break` widget's header area. The editor has already
     * expanded the `#`/`@`/`*` placeholders into these spans for this exact
     * page, so the PDF reproduces the same header. Returns undefined when the
     * widget has no header area (e.g. an entirely blank page-1 override).
     */
    private extractHeader(widget: HTMLElement): PageHeader | undefined {
        const area = widget.querySelector(".pagination-header-area");
        if (!area) return undefined;
        const read = (cls: string) =>
            (area.querySelector(`.${cls}`) as HTMLElement | null)?.textContent ?? "";
        return {
            left: read("pagination-header-left"),
            middle: read("pagination-header-middle"),
            right: read("pagination-header-right"),
        };
    }

    /**
     * Read the page's three footer columns (left / middle / right) out of a
     * `.pagination-page-break` or `.pagination-last-page` widget's footer area.
     * The editor has already expanded the `#`/`@`/`*` placeholders into these
     * spans, so the PDF reproduces the same footer. On a page-break widget the
     * footer belongs to the page ENDING before the break; on the last-page
     * widget it belongs to the final page. Returns undefined when the widget
     * has no footer area.
     */
    private extractFooter(widget: HTMLElement): PageFooter | undefined {
        const area = widget.querySelector(".pagination-footer-area");
        if (!area) return undefined;
        const read = (cls: string) =>
            (area.querySelector(`.${cls}`) as HTMLElement | null)?.textContent ?? "";
        return {
            left: read("pagination-footer-left"),
            middle: read("pagination-footer-middle"),
            right: read("pagination-footer-right"),
        };
    }

    // ── VisualLine[] → PDF ───────────────────────────────────────────────────

    /**
     * Compute the page-left reference in browser pixels.
     * The `<p>` elements are `width: 100%` of the pagination container with
     * `box-sizing: border-box`, so their border-box left edge IS the page edge.
     * Text is offset from there by each element's own `padding-left`.
     */
    private getPageLeftPx(referenceEl: HTMLElement): number {
        for (let i = 0; i < referenceEl.children.length; i++) {
            const child = referenceEl.children[i] as HTMLElement;
            if (child?.tagName === "P") {
                return child.getBoundingClientRect().left;
            }
            // The first block may be a dual_dialogue; use its left column's first <p>
            // which starts at the same left edge as a regular full-width <p>.
            if (child?.classList.contains("dual_dialogue")) {
                const firstCol = child.querySelector(":scope > .dual_dialogue_column") as HTMLElement | null;
                const firstP = firstCol?.querySelector("p") as HTMLElement | null;
                if (firstP) return firstP.getBoundingClientRect().left;
            }
        }
        return 0;
    }

    // ── Revision filtering ───────────────────────────────────────────────────

    /**
     * Stamp a top-level node's collected lines, mirroring the editor overlay
     * (`computeNodeLines` in revisions-extension) so the PDF's asterisks land on
     * exactly the lines the screenplay shows them on:
     *  - when the node's text carries inline `revision` marks, only the visual
     *    lines those marks actually land on are revised. `collectParagraphLines`
     *    has already stamped them character by character, so there is nothing
     *    left to do — stamping the whole node here would print a column of
     *    asterisks down a paragraph where a single word changed.
     *  - otherwise the node-level `data-revision-line` attribute (an empty or
     *    emptied line, which has no character to anchor a mark on) stamps the
     *    node's FIRST line, like the overlay's single entry at `lineHeight / 2`.
     *
     * `lineGroups` are the node's line runs in document order — more than one
     * only when a page break splits the node, in which case the attribute
     * belongs to the first half that produced any line.
     */
    private stampNodeRevision(el: HTMLElement, lineGroups: VisualLine[][]): void {
        if (el.querySelector("[data-revision]")) return;
        const attr = parseInt(el.getAttribute("data-revision-line") || "", 10);
        if (!(attr >= 1)) return;
        for (const lines of lineGroups) {
            if (lines.length > 0) {
                lines[0].revision = attr;
                return;
            }
        }
    }

    /**
     * The inline `revision` mark covering a text node, or index 0 when it
     * carries none. Walks up to the paragraph looking for the mark span
     * (`data-revision`); reading the attribute rather than the computed colour
     * keeps the export independent of the editor's current display mode.
     *
     * `isDel` flags a deletion anchor (`data-revision-kind="del"`): an invisible
     * marker pinned to a character that SURVIVED the deletion, so the asterisk
     * lands on the line the text was removed from. It marks the line but must
     * never tint the character it rides on.
     */
    private readRevisionMark(textNode: Text, stopEl: HTMLElement): { index: number; isDel: boolean } {
        let node = textNode.parentElement;
        while (node && node !== stopEl.parentElement) {
            const raw = node.getAttribute("data-revision");
            if (raw !== null) {
                const v = parseInt(raw, 10);
                if (!(v >= 1)) return { index: 0, isDel: false };
                return { index: v, isDel: node.getAttribute("data-revision-kind") === "del" };
            }
            if (node === stopEl) break;
            node = node.parentElement;
        }
        return { index: 0, isDel: false };
    }

    /**
     * Apply the chosen {@link RevisionExportMode} to already-collected lines:
     *  - `none`    — strip any per-run revision colour so the script prints clean
     *                and draws no asterisks.
     *  - `colored` — tint each revised run in its revision colour and give every
     *                revised line a matching coloured right-margin asterisk.
     *  - `bw`      — keep the asterisks (in black) but leave the text uncoloured.
     * The asterisk itself is drawn by the worker from `line.asteriskColor`.
     */
    private applyRevisionStyling(lines: VisualLine[], mode: RevisionExportMode): void {
        for (const line of lines) {
            if (line.type === "__page_break__") continue;
            if (mode !== "none" && line.revision) {
                line.asteriskColor = mode === "colored" ? revisionColor(line.revision) ?? "#000000" : "#000000";
            }
            if (mode === "colored") {
                for (const run of line.runs) {
                    if (run.revision) run.color = revisionColor(run.revision);
                }
            }
        }
    }

    /**
     * Drop the pages the caller doesn't want and re-stitch the rest. Lines are
     * grouped into pages by the `__page_break__` sentinels; `keep` is called with
     * each page (its lines + the set of revisions stamped on it) and its 1-based
     * ordinal. Surviving pages are re-emitted preceded by a sentinel carrying
     * their ORIGINAL label, so page numbers stay correct even though the dropped
     * pages leave gaps. The first kept page keeps no leading sentinel when it is
     * the original page 1 (which has no header); otherwise its label is emitted
     * as a leading sentinel that the worker draws in place (see renderLines).
     */
    private keepPages(
        lines: VisualLine[],
        lastPageFooter: PageFooter | undefined,
        keep: (page: { lines: VisualLine[]; revisions: Set<number> }, ordinal: number) => boolean,
    ): { lines: VisualLine[]; lastFooter: PageFooter | undefined } {
        type Page = {
            label?: string;
            header?: PageHeader;
            footer?: PageFooter;
            lines: VisualLine[];
            revisions: Set<number>;
        };
        const pages: Page[] = [{ lines: [], revisions: new Set() }];
        for (const line of lines) {
            if (line.type === "__page_break__") {
                // A break sentinel carries the footer of the page that just
                // ended and the header of the page about to begin.
                pages[pages.length - 1].footer = line.footer;
                pages.push({ label: line.pageLabel, header: line.header, lines: [], revisions: new Set() });
                continue;
            }
            const page = pages[pages.length - 1];
            page.lines.push(line);
            if (line.revision) page.revisions.add(line.revision);
        }
        // The final page has no trailing sentinel; its footer comes from the
        // dedicated last-page widget.
        pages[pages.length - 1].footer = lastPageFooter;

        const out: VisualLine[] = [];
        let first = true;
        // Footer of the previously kept page — the worker draws it at the bottom
        // of that page just before the break that begins the current one.
        let prevKeptFooter: PageFooter | undefined = undefined;
        let lastFooter: PageFooter | undefined = undefined;
        pages.forEach((page, idx) => {
            if (!keep(page, idx + 1)) return;
            // A break sentinel before every kept page except an original-page-1
            // first page (it renders as page 1 with no header).
            if (!first || page.label !== undefined) {
                out.push({
                    runs: [],
                    y: 0,
                    type: "__page_break__",
                    pageLabel: page.label,
                    header: page.header,
                    footer: prevKeptFooter,
                });
            }
            out.push(...page.lines);
            prevKeptFooter = page.footer;
            lastFooter = page.footer;
            first = false;
        });
        return { lines: out, lastFooter };
    }
}
