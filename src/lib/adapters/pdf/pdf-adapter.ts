
import { BaseExportOptions, ProjectAdapter } from "../screenplay-adapter";
import { ProjectData, ProjectState } from "@src/lib/project/project-state";
import { PageFormat } from "@src/lib/utils/enums";
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

import type { WorkerMessage, WorkerPayload, VisualLine } from "./pdf.worker";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Scale factor from browser pixels (96 DPI) to PDF points (72 DPI). */
const PX_TO_PT = 72 / 96;

/** PDF page dimensions in points, derived from pagination-extension pixel sizes. */
const PDF_PAGE_SIZES: Record<PageFormat, { width: number; height: number }> = {
    LETTER: { width: PAGE_SIZES.LETTER.pageWidth * PX_TO_PT, height: PAGE_SIZES.LETTER.pageHeight * PX_TO_PT },
    A4: { width: PAGE_SIZES.A4.pageWidth * PX_TO_PT, height: PAGE_SIZES.A4.pageHeight * PX_TO_PT },
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
    extension = "pdf";

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

        const titlePageLines = titlePageEl ? this.collectLines(titlePageEl, options) : [];
        const titlePageLeftPx = titlePageEl ? this.getPageLeftPx(titlePageEl) : 0;

        let screenplayLines = this.collectLines(editorEl, options);
        // Page selection: keep only the chosen pages (by range or by revision).
        const sel = options.pageSelection;
        if (sel?.mode === "ranges" && sel.ranges.length > 0) {
            screenplayLines = this.keepPages(screenplayLines, (_page, ordinal) =>
                sel.ranges.some(([start, end]) => ordinal >= start && ordinal <= end),
            );
        } else if (sel?.mode === "revisions" && sel.revisions.length > 0) {
            const wanted = new Set(sel.revisions);
            screenplayLines = this.keepPages(screenplayLines, (page) => {
                for (const r of page.revisions) if (wanted.has(r)) return true;
                return false;
            });
        }
        this.applyRevisionStyling(screenplayLines, options.revisionExport ?? "colored");
        const screenplayLeftPx = this.getPageLeftPx(editorEl);

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
                contdLabel: options.contdLabel ?? "(CONT'D)",
                moreLabel: options.moreLabel ?? "(MORE)",
            };

            worker.postMessage({ type: "START", payload });
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    convertFrom(_: ArrayBuffer): Partial<ProjectData> {
        throw new Error("Method not implemented.");
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
                });
                continue;
            }

            // ── Dual dialogue container ──
            if (el.classList.contains("dual_dialogue")) {
                const ddLines = this.collectDualDialogueLines(el, options, yOffset);
                this.stampRevision(ddLines, this.getParagraphRevision(el));
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

            // Revision the node was last changed under — stamped on every line it
            // produces so the revised-pages filter can tell which pages changed.
            const paragraphRevision = this.getParagraphRevision(el);

            if (splitWidget) {
                // Collect lines BEFORE the split widget
                const beforeLines = this.collectParagraphLines(el, nodeType, splitWidget, "before");
                if (beforeLines.length > 0) {
                    if (yOffset > 0) {
                        for (const line of beforeLines) line.y -= yOffset;
                    }
                    this.injectPseudoContent(el, beforeLines, options, sceneInfo);
                    this.stampRevision(beforeLines, paragraphRevision);
                    allLines.push(...beforeLines);
                }

                // Emit page break sentinel
                allLines.push({
                    runs: [],
                    y: 0,
                    type: "__page_break__",
                    pageLabel: this.extractPageLabel(splitWidget),
                });

                // Collect lines AFTER the split widget
                const afterLines = this.collectParagraphLines(el, nodeType, splitWidget, "after");
                if (afterLines.length > 0) {
                    if (yOffset > 0) {
                        for (const line of afterLines) line.y -= yOffset;
                    }
                    this.stampRevision(afterLines, paragraphRevision);
                    allLines.push(...afterLines);
                }
            } else {
                const paragraphLines = this.collectParagraphLines(el, nodeType);

                if (paragraphLines.length > 0) {
                    // Apply yOffset to close physical gaps from entirely skipped text nodes
                    if (yOffset > 0) {
                        for (const line of paragraphLines) line.y -= yOffset;
                    }
                    // ── Pseudo-element content (not captured by TreeWalker) ──
                    this.injectPseudoContent(el, paragraphLines, options, sceneInfo);
                    this.stampRevision(paragraphLines, paragraphRevision);
                    allLines.push(...paragraphLines);
                } else {
                    // Empty paragraph — no text nodes, so collectParagraphLines
                    // returns nothing. We still emit a zero-run VisualLine at
                    // the paragraph's browser Y position so that renderLines
                    // advances Y by exactly one line height and does NOT
                    // misinterpret the accumulated gap as a page break.
                    const rect = el.getBoundingClientRect();
                    if (rect.height > 0) {
                        allLines.push({
                            runs: [],
                            y: rect.top - yOffset,
                            type: nodeType,
                            revision: paragraphRevision >= 1 ? paragraphRevision : undefined,
                        });
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
                    columnLines.push(...paragraphLines);
                } else {
                    // Empty paragraph — emit a spacer line so Y advances correctly.
                    const rect = p.getBoundingClientRect();
                    if (rect.height > 0) {
                        columnLines.push({ runs: [], y: rect.top - yOffset, type: nodeType });
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
            // Revision index colouring this run, if any — read straight from the
            // `revision` mark span so it's independent of the editor's current
            // display mode (which only tints, it never removes the attribute).
            const revision = this.getTextNodeRevision(textNode, el);

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

        if (el.classList.contains("contd")) {
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
     * Highest revision index a top-level node was changed under, read from the
     * DOM the revisions extension renders: the inline `data-revision` marks
     * (changed text, both "ins" and "del" anchors) and the `data-revision-line`
     * node attribute (empty/deleted lines). Returns 0 when the node carries no
     * revision (the common case). Display mode is irrelevant — these attributes
     * are always present, only their colour varies.
     */
    private getParagraphRevision(el: HTMLElement): number {
        let max = 0;
        const lineAttr = el.getAttribute("data-revision-line");
        if (lineAttr) {
            const v = parseInt(lineAttr, 10);
            if (v >= 1) max = v;
        }
        const marks = el.querySelectorAll("[data-revision]");
        for (let i = 0; i < marks.length; i++) {
            const v = parseInt(marks[i].getAttribute("data-revision") || "", 10);
            if (v >= 1 && v > max) max = v;
        }
        return max;
    }

    /** Tag every line with `rev` when it is a real revision (>=1); a no-op otherwise. */
    private stampRevision(lines: VisualLine[], rev: number): void {
        if (rev < 1) return;
        for (const line of lines) line.revision = rev;
    }

    /**
     * Revision index colouring a single text node, or 0 when it carries none.
     * Walks up to the paragraph looking for the inline `revision` mark span
     * (`data-revision`). A "del" anchor (`data-revision-kind="del"`) is an
     * invisible position marker — it must NOT tint its surviving character — so
     * it returns 0. Reading the attribute (not the computed colour) keeps the
     * export independent of the editor's current revision display mode.
     */
    private getTextNodeRevision(textNode: Text, stopEl: HTMLElement): number {
        let node = textNode.parentElement;
        while (node && node !== stopEl.parentElement) {
            const raw = node.getAttribute("data-revision");
            if (raw !== null) {
                if (node.getAttribute("data-revision-kind") === "del") return 0;
                const v = parseInt(raw, 10);
                return v >= 1 ? v : 0;
            }
            if (node === stopEl) break;
            node = node.parentElement;
        }
        return 0;
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
        keep: (page: { lines: VisualLine[]; revisions: Set<number> }, ordinal: number) => boolean,
    ): VisualLine[] {
        type Page = { label?: string; lines: VisualLine[]; revisions: Set<number> };
        const pages: Page[] = [{ lines: [], revisions: new Set() }];
        for (const line of lines) {
            if (line.type === "__page_break__") {
                pages.push({ label: line.pageLabel, lines: [], revisions: new Set() });
                continue;
            }
            const page = pages[pages.length - 1];
            page.lines.push(line);
            if (line.revision) page.revisions.add(line.revision);
        }

        const out: VisualLine[] = [];
        let first = true;
        pages.forEach((page, idx) => {
            if (!keep(page, idx + 1)) return;
            // A break sentinel before every kept page except an original-page-1
            // first page (it renders as page 1 with no header).
            if (!first || page.label !== undefined) {
                out.push({ runs: [], y: 0, type: "__page_break__", pageLabel: page.label });
            }
            out.push(...page.lines);
            first = false;
        });
        return out;
    }
}
