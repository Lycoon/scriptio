import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";

import { PDFAdapter, type PDFExportOptions, type RevisionExportMode } from "@src/lib/adapters/pdf/pdf-adapter";
import type { VisualLine } from "@src/lib/adapters/pdf/pdf.worker";
import { BASE_EXTENSIONS } from "@src/lib/screenplay/editor";
import { createRevisionsExtension, refreshRevisions } from "@src/lib/screenplay/extensions/revisions-extension";

/**
 * The editor and the PDF exporter place revision asterisks through completely
 * separate code — the overlay measures the revision mark's client rects
 * (`computeNodeLines`), the exporter walks characters into `VisualLine`s — over
 * one and the same laid-out DOM. Two implementations of one rule is exactly the
 * shape that drifts: the exporter once stamped every line of a revised node, so
 * a word changed at the end of a wrapped speech printed an asterisk beside every
 * line of it while the screen showed one.
 *
 * These tests drive a real editor through the real stamping path, then assert
 * the two agree LINE FOR LINE — which visual line carries an asterisk, and in
 * which revision colour. They fail if either side drifts, so they also cover the
 * editor's own placement, and they are written against the property the user
 * sees ("the PDF matches the screenplay") rather than against either
 * implementation's idea of it.
 *
 * Both sides are compared as computed placements, not painted pixels: the
 * overlay's inline `top` is read straight back. Where the overlay element then
 * lands on screen is a stylesheet concern, and not what drifted here.
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

/** Editor line box, in px. Font size matches it so a text rect's height is the
 *  line box height on both engines, keeping the two centre lines sub-pixel
 *  apart — see {@link asteriskRows}. */
const LINE_HEIGHT = 16;

/** Wraps to several lines inside the fixture's 420px text column. */
const LONG =
    "the quick brown fox jumps over the lazy dog while the dog sleeps on and " +
    "on beneath a wide and cloudless afternoon sky above the quiet valley";

type RevState = { enabled: boolean; current: number; display: "all" | "hidden" | "current" };

const teardown: Array<() => void> = [];
afterEach(() => {
    while (teardown.length) teardown.pop()!();
});

/**
 * Boot a real editor holding `paragraphs` as action nodes, sized to a page so
 * the long ones wrap. The page custom properties are normally set by the
 * pagination extension; without them the overlay renderer bails out and paints
 * nothing.
 *
 * `injectCSS` is left ON so ProseMirror's own stylesheet governs how text is
 * laid out — in particular `white-space: break-spaces`, which keeps a trailing
 * space measurable instead of collapsing it. A fixture that hand-rolls its
 * styles silently measures a layout the app never renders; see the guard test at
 * the bottom of this file.
 */
function makeEditor(paragraphs: string[]) {
    const style = document.createElement("style");
    style.textContent = `
        .parity-host .ProseMirror {
            width: 612px;
            box-sizing: border-box;
            font: ${LINE_HEIGHT}px monospace;
            line-height: ${LINE_HEIGHT}px;
        }
        .parity-host .ProseMirror p { margin: 0; padding: 0 96px; }
    `;
    document.head.appendChild(style);

    const el = document.createElement("div");
    el.className = "parity-host";
    document.body.appendChild(el);
    const rev: RevState = { enabled: false, current: 0, display: "all" };

    const editor = new Editor({
        element: el,
        injectCSS: true,
        autofocus: false,
        content: {
            type: "doc",
            content: paragraphs.map((text, i) => ({
                type: "action",
                attrs: { "data-id": `n${i}`, class: "action" },
                content: text ? [{ type: "text", text }] : undefined,
            })),
        },
        extensions: [
            ...BASE_EXTENSIONS,
            createRevisionsExtension({
                getRevisionsEnabled: () => rev.enabled,
                getCurrentRevision: () => rev.current,
                getDisplayMode: () => rev.display,
            }),
        ],
    });

    const dom = editor.view.dom as HTMLElement;
    dom.style.setProperty("--page-height", "1000px");
    dom.style.setProperty("--page-gap", "20px");
    dom.style.setProperty("--page-width", "612px");
    dom.style.setProperty("--page-margin-right", "96px");
    dom.style.setProperty("--page-margin-top", "0px");
    dom.style.setProperty("--page-margin-bottom", "0px");
    dom.style.setProperty("--line-height", `${LINE_HEIGHT}px`);

    teardown.push(() => {
        editor.destroy();
        el.remove();
        style.remove();
    });
    return { editor, rev, dom };
}

/** Revision stamping is debounced (FLUSH_DELAY = 220ms). */
const settle = () => new Promise((r) => setTimeout(r, 320));
/** The overlay repaints on a coalesced rAF; two frames is past it. */
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));

/** Document position just inside top-level child `index`. */
const insidePos = (editor: Editor, index: number): number => {
    let pos = -1;
    editor.state.doc.forEach((node, p, i) => {
        if (i === index) pos = p + 1;
    });
    return pos;
};

/** Document position at the very END of top-level child `index`. */
const endPos = (editor: Editor, index: number): number => {
    let pos = -1;
    editor.state.doc.forEach((node, p, i) => {
        if (i === index) pos = p + node.nodeSize - 1;
    });
    return pos;
};

/** CSSOM-normalised colour ("#2f74c0" and "rgb(47, 116, 192)" → one string), so
 *  the exporter's hex and the overlay's computed rgb() compare equal. */
const probe = document.createElement("span");
const normalizeColor = (c: string): string => {
    probe.style.color = "";
    probe.style.color = c;
    return probe.style.color;
};

/** The exporter's content lines (page-break sentinels dropped), already carrying
 *  their asterisk colours. */
const pdfLines = (dom: HTMLElement): VisualLine[] => {
    const adapter = new PDFAdapter();
    const lines = internals(adapter).collectLines(dom, options).filter((l) => l.type !== "__page_break__");
    internals(adapter).applyRevisionStyling(lines, "colored");
    return lines;
};

/**
 * The heart of the comparison: reduce both renderers to `visual line ordinal →
 * asterisk colour`, so they are compared as "which line changed" rather than as
 * raw pixels in two different coordinate spaces.
 *
 * The exporter's ordinals are the index into its own content lines. Each overlay
 * asterisk is paired with the exporter line nearest it vertically: the overlay's
 * inline `top` is the line's centre in editor-local coordinates, and the
 * exporter's `y` is that same line's top in viewport coordinates, so the two
 * land within a fraction of a pixel once both are put in editor-local centres.
 * Rows are a whole line-height apart, so requiring the winner to be within half
 * a line makes the pairing unambiguous — an asterisk that matched no line, or
 * matched by luck, fails the test rather than quietly mapping onto a neighbour.
 */
const asteriskRows = (dom: HTMLElement, lines: VisualLine[]): Map<number, string> => {
    const overlay = dom.querySelector(".revision-overlay") as HTMLElement | null;
    const domTop = dom.getBoundingClientRect().top;
    const centres = lines.map((l) => l.y - domTop + LINE_HEIGHT / 2);

    const rows = new Map<number, string>();
    for (const node of overlay?.querySelectorAll(".revision-asterisk") ?? []) {
        const el = node as HTMLElement;
        const top = parseFloat(el.style.top);
        let best = -1;
        let bestDistance = Infinity;
        centres.forEach((centre, i) => {
            const distance = Math.abs(centre - top);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = i;
            }
        });
        expect(bestDistance).toBeLessThan(LINE_HEIGHT / 2);
        rows.set(best, normalizeColor(el.style.color));
    }
    return rows;
};

/** The same map, from the exporter's side. */
const exportedRows = (lines: VisualLine[]): Map<number, string> => {
    const rows = new Map<number, string>();
    lines.forEach((line, i) => {
        if (line.asteriskColor) rows.set(i, normalizeColor(line.asteriskColor));
    });
    return rows;
};

/** Repaint the overlay and collect both sides over one settled DOM. */
async function bothSides(editor: Editor, dom: HTMLElement) {
    await settle();
    refreshRevisions(editor);
    await frames();

    const lines = pdfLines(dom);
    return { lines, screen: asteriskRows(dom, lines), pdf: exportedRows(lines) };
}

describe("PDF revision asterisks match the screenplay's, line for line", () => {
    it("agrees on a word changed at the end of a wrapped paragraph", async () => {
        const { editor, rev, dom } = makeEditor(["OPENING", LONG, LONG, "CLOSING"]);
        rev.enabled = true;
        rev.current = 2;

        editor.chain().focus().insertContentAt(endPos(editor, 1), " rewritten").run();
        const { lines, screen, pdf } = await bothSides(editor, dom);

        expect(lines.length).toBeGreaterThan(6); // the fixture really wraps
        expect(screen.size).toBe(1); // one changed line, one asterisk
        expect(pdf).toEqual(screen);
    });

    it("agrees when the change opens a paragraph instead of ending it", async () => {
        const { editor, rev, dom } = makeEditor(["OPENING", LONG, LONG, "CLOSING"]);
        rev.enabled = true;
        rev.current = 1;

        editor.chain().focus().insertContentAt(insidePos(editor, 2), "rewritten ").run();
        const { screen, pdf } = await bothSides(editor, dom);

        expect(screen.size).toBe(1);
        expect(pdf).toEqual(screen);
    });

    it("agrees on an insertion long enough to cover several visual lines", async () => {
        const { editor, rev, dom } = makeEditor(["OPENING", "short line", "CLOSING"]);
        rev.enabled = true;
        rev.current = 3;

        editor.chain().focus().insertContentAt(endPos(editor, 1), ` ${LONG}`).run();
        const { screen, pdf } = await bothSides(editor, dom);

        expect(screen.size).toBeGreaterThan(1); // genuinely multi-line
        expect(pdf).toEqual(screen);
    });

    it("agrees on a deletion, which marks its line without colouring text", async () => {
        const { editor, rev, dom } = makeEditor(["OPENING", LONG, "CLOSING"]);
        rev.enabled = true;
        rev.current = 4;

        // Delete "brown " from inside the first visual line, so the anchor mark
        // lands on the "f" of "fox".
        const from = insidePos(editor, 1) + 10;
        editor.chain().focus().deleteRange({ from, to: from + 6 }).run();
        const { lines, screen, pdf } = await bothSides(editor, dom);

        expect(screen.size).toBe(1);
        expect(pdf).toEqual(screen);
        // The anchor is a position marker riding a surviving character, so it
        // must not tint anything on either side.
        expect(lines.every((l) => l.runs.every((r) => r.color === undefined))).toBe(true);
    });

    it("agrees on deleting a line's last word, anchoring on the trailing space", async () => {
        const { editor, rev, dom } = makeEditor(["OPENING", LONG, "CLOSING"]);
        rev.enabled = true;
        rev.current = 2;

        // Backspacing away the final word leaves the line ending in a space, and
        // that space is what the invisible "del" mark rides. `white-space:
        // break-spaces` is what keeps it occupying width, so it can still carry
        // the line's asterisk — on screen and in the PDF alike.
        const at = endPos(editor, 1);
        editor.chain().focus().deleteRange({ from: at - "valley".length, to: at }).run();
        const { screen, pdf } = await bothSides(editor, dom);

        expect(editor.state.doc.child(1).textContent.endsWith(" ")).toBe(true);
        expect(screen.size).toBe(1);
        expect(pdf).toEqual(screen);
    });

    it("agrees on a new empty line, which has no text to anchor a mark to", async () => {
        const { editor, rev, dom } = makeEditor(["OPENING", LONG, "CLOSING"]);
        rev.enabled = true;
        rev.current = 5;

        editor.chain().focus().setTextSelection(endPos(editor, 1)).splitBlock().run();
        const { screen, pdf } = await bothSides(editor, dom);

        expect(screen.size).toBeGreaterThan(0);
        expect(pdf).toEqual(screen);
    });

    it("agrees on two revisions landing on different lines of one paragraph", async () => {
        const { editor, rev, dom } = makeEditor(["OPENING", LONG, "CLOSING"]);
        rev.enabled = true;

        rev.current = 1;
        editor.chain().focus().insertContentAt(insidePos(editor, 1), "first ").run();
        await settle();

        rev.current = 6;
        editor.chain().focus().insertContentAt(endPos(editor, 1), " second").run();
        const { screen, pdf } = await bothSides(editor, dom);

        expect(screen.size).toBe(2);
        expect(new Set(screen.values()).size).toBe(2); // two different colours
        expect(pdf).toEqual(screen);
    });

    it("lays text out the way the app does (fixture guard)", () => {
        // First paragraph deliberately ends in a space — what deleting a line's
        // last word leaves behind.
        const { dom } = makeEditor(["They walk toward the ", LONG]);

        // ProseMirror's stylesheet sets `white-space: break-spaces` on the
        // editor. It is not cosmetic: it decides where lines wrap, and it keeps
        // a trailing space occupying real width rather than collapsing to zero
        // rects. A fixture that omits it measures a layout the app never
        // renders — and every parity assertion in this file is then agreement
        // about the wrong thing. Pinned here so a change in what TipTap injects
        // fails loudly instead of quietly deforming the fixture.
        expect(getComputedStyle(dom).whiteSpace).toBe("break-spaces");

        // A trailing space therefore measures: deleting a line's last word
        // anchors the invisible "del" mark on it, and it must still be able to
        // carry that line's asterisk.
        const p = dom.querySelector("p")!;
        const text = p.firstChild as Text;
        const range = document.createRange();
        range.setStart(text, text.length - 1);
        range.setEnd(text, text.length);
        expect(range.getClientRects().length).toBeGreaterThan(0);
    });

    it("agrees that an untouched script carries no asterisks at all", async () => {
        const { editor, rev, dom } = makeEditor(["OPENING", LONG, LONG, "CLOSING"]);
        rev.enabled = true;
        rev.current = 2;

        const { screen, pdf } = await bothSides(editor, dom);

        expect(screen.size).toBe(0);
        expect(pdf).toEqual(screen);
    });
});
