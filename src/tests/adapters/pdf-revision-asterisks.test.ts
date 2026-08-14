import { afterEach, describe, expect, it } from "vitest";

import { PDFAdapter, type PDFExportOptions, type RevisionExportMode } from "@src/lib/adapters/pdf/pdf-adapter";
import type { VisualLine } from "@src/lib/adapters/pdf/pdf.worker";
import { revisionColor } from "@src/lib/screenplay/revisions";

/**
 * A production revision asterisk marks the VISUAL line that changed, not the
 * paragraph it sits in — a word retyped at the end of a five-line speech prints
 * one asterisk, beside that line only. The editor overlay measures the revision
 * mark's client rects to place them (see `computeNodeLines` in
 * revisions-extension), and the PDF must agree line for line, since both are
 * read off the same laid-out DOM.
 *
 * Runs in real Chromium and WebKit (see vitest.config.ts): the whole point is
 * where the browser wraps the text, which jsdom cannot provide.
 */

type AdapterInternals = {
    collectLines(el: HTMLElement, options: PDFExportOptions): VisualLine[];
    applyRevisionStyling(lines: VisualLine[], mode: RevisionExportMode): void;
};

const internals = (adapter: PDFAdapter) => adapter as unknown as AdapterInternals;

const options = { includeNotes: true } as PDFExportOptions;

/** Long enough to wrap over several lines inside the action margins. */
const LONG_LINE =
    "the quick brown fox jumps over the lazy dog while the dog sleeps on and " +
    "on beneath a wide and cloudless afternoon sky above the quiet valley and " +
    "the river that runs slowly past the old mill on its way to the distant sea";

/** The revision mark span as the revisions extension renders it. */
const ins = (index: number, text: string) => `<span data-revision="${index}">${text}</span>`;
/** A deletion anchor: invisible marker riding a character that survived. */
const del = (index: number, text: string) =>
    `<span data-revision="${index}" data-revision-kind="del">${text}</span>`;

const teardown: Array<() => void> = [];
afterEach(() => {
    while (teardown.length) teardown.pop()!();
});

/** Mount a page-width stand-in for the editor holding `html`. */
const mountEditor = (html: string) => {
    const style = document.createElement("style");
    style.textContent = `
        .test-scroller { width: 700px; height: 400px; overflow: auto; }
        .test-pm {
            --page-width: 612px;
            --display-margin-scale: 1;
            width: var(--page-width) !important;
            box-sizing: border-box;
            font: 16px monospace;
            line-height: 16px;
            /* As ProseMirror's own stylesheet sets it. It decides where lines
             * wrap and keeps trailing spaces occupying real width, so omitting
             * it would measure a layout the app never renders. */
            white-space: break-spaces;
            --page-margin-left: 96px;
            --page-margin-right: 96px;
        }
        .test-pm p { margin: 0 0 16px 0; padding: 0 96px; }
    `;
    document.head.appendChild(style);

    const scroller = document.createElement("div");
    scroller.className = "test-scroller";
    const editor = document.createElement("div");
    editor.className = "test-pm";
    editor.innerHTML = html;
    scroller.appendChild(editor);
    document.body.appendChild(scroller);

    teardown.push(() => {
        scroller.remove();
        style.remove();
    });
    return editor;
};

/** Collected content lines (page-break sentinels dropped) and their text. */
const collect = (editor: HTMLElement) => {
    const lines = internals(new PDFAdapter()).collectLines(editor, options);
    return lines.filter((l) => l.type !== "__page_break__");
};

const textOf = (line: VisualLine) => line.runs.map((r) => r.text).join("");

describe("PDF revision asterisks land on the changed visual line only", () => {
    it("marks just the wrapped line holding the revised word", () => {
        const editor = mountEditor(`<p class="action">${LONG_LINE} ${ins(2, "rewritten")}</p>`);
        const lines = collect(editor);

        expect(lines.length).toBeGreaterThan(2); // the paragraph really wraps
        const marked = lines.filter((l) => l.revision !== undefined);
        expect(marked).toHaveLength(1);
        expect(marked[0].revision).toBe(2);
        expect(textOf(marked[0])).toContain("rewritten");
    });

    it("marks every line a multi-line revised run covers, and no others", () => {
        const editor = mountEditor(
            `<p class="action">short opener. ${ins(1, LONG_LINE)} tail.</p>`,
        );
        const lines = collect(editor);

        // The run starts on line 1 and wraps to the end, so every line is marked
        // — the correct outcome here, reached per line rather than by fiat.
        expect(lines.length).toBeGreaterThan(2);
        expect(lines.every((l) => l.revision === 1)).toBe(true);
    });

    it("keeps the highest revision when two overlap on one line", () => {
        const editor = mountEditor(
            `<p class="action">${ins(1, "blue word")} plain ${ins(3, "yellow word")}</p>`,
        );
        const [line] = collect(editor);

        expect(line.revision).toBe(3);
    });

    it("marks a deletion's line without tinting the character it anchors to", () => {
        const editor = mountEditor(`<p class="action">${LONG_LINE} ${del(4, "t")}ail</p>`);
        const lines = collect(editor);

        const marked = lines.filter((l) => l.revision !== undefined);
        expect(marked).toHaveLength(1);
        expect(marked[0].revision).toBe(4);
        // The anchor is a position marker, so no run on that line is coloured.
        internals(new PDFAdapter()).applyRevisionStyling(lines, "colored");
        expect(marked[0].asteriskColor).toBe(revisionColor(4));
        expect(marked[0].runs.every((r) => r.color === undefined)).toBe(true);
    });

    it("marks the first line only when the node attribute is the sole revision", () => {
        // `data-revision-line` covers changes with no markable text (a new empty
        // line, or one emptied by a deletion). A non-empty node can still carry
        // it from an earlier edit; the mark, when present, wins.
        // `<br>` stands in for ProseMirror's trailing break, which is what gives
        // an empty paragraph a line box (and so a measurable height) at all.
        const editor = mountEditor(
            `<p class="action" data-revision-line="5">${LONG_LINE}</p>` +
                `<p class="action" data-revision-line="5"><br></p>`,
        );
        const lines = collect(editor);

        expect(lines.length).toBeGreaterThan(2);
        expect(lines[0].revision).toBe(5);
        expect(lines.slice(1, -1).every((l) => l.revision === undefined)).toBe(true);
        // The trailing empty paragraph is a single line and keeps its stamp.
        expect(lines[lines.length - 1].revision).toBe(5);
    });

    it("ignores the node attribute when the text carries a mark", () => {
        const editor = mountEditor(
            `<p class="action" data-revision-line="1">${LONG_LINE} ${ins(2, "rewritten")}</p>`,
        );
        const lines = collect(editor);

        const marked = lines.filter((l) => l.revision !== undefined);
        expect(marked).toHaveLength(1);
        expect(marked[0].revision).toBe(2);
    });

    it("draws no asterisks at all in the `none` export mode", () => {
        const editor = mountEditor(`<p class="action">${LONG_LINE} ${ins(2, "rewritten")}</p>`);
        const lines = collect(editor);
        internals(new PDFAdapter()).applyRevisionStyling(lines, "none");

        expect(lines.every((l) => l.asteriskColor === undefined)).toBe(true);
        expect(lines.every((l) => l.runs.every((r) => r.color === undefined))).toBe(true);
    });
});
