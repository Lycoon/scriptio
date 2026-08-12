import { afterEach, describe, expect, it } from "vitest";

import { PDFAdapter, type PDFExportOptions } from "@src/lib/adapters/pdf/pdf-adapter";
import type { VisualLine } from "@src/lib/adapters/pdf/pdf.worker";

/**
 * The PDF exporter reads its geometry from the live editor DOM, which the two
 * phone view modes deform: paged scales the page to fit the viewport
 * (`transform: scale(var(--editor-zoom))`) and endless drops the page
 * rectangle altogether, widening the editor to the viewport and compressing the
 * screenplay margins (`--display-margin-scale`). These tests mount a miniature
 * editor, deform it each way, and assert the collected lines still match the
 * canonical page — the PDF must not depend on the viewport the script happens
 * to be open on.
 *
 * Runs in real Chromium and WebKit (see vitest.config.ts): the whole point is
 * browser layout, which jsdom cannot provide.
 */

// The adapter's DOM pass is internal; tests reach it directly rather than
// booting a worker + jsPDF to produce a blob.
type AdapterInternals = {
    collectLines(el: HTMLElement, options: PDFExportOptions): VisualLine[];
    withCanonicalLayout<T>(elements: (HTMLElement | undefined)[], measure: () => T): T;
    getPageLeftPx(el: HTMLElement): number;
};

const internals = (adapter: PDFAdapter) => adapter as unknown as AdapterInternals;

const options = { includeNotes: true } as PDFExportOptions;

/** Long enough to wrap several times inside the dialogue column. */
const LONG_LINE =
    "the quick brown fox jumps over the lazy dog while the dog sleeps on and " +
    "on beneath a wide and cloudless afternoon sky above the quiet valley";

const teardown: Array<() => void> = [];
afterEach(() => {
    while (teardown.length) teardown.pop()!();
});

/**
 * Mount a stand-in for the editor: a scroll container holding a page-width
 * `.ProseMirror` whose scale, width and margin compression are driven by the
 * same CSS variables and `!important` overrides the real stylesheets use, so
 * pinning them exercises the production code path.
 *
 * `.endless` on the scroller reproduces the phone endless-scroll mode from
 * EditorPanel.module.css: a phone-narrow viewport, an editor widened to fill it
 * instead of the page, and screenplay margins compressed to 0.3×.
 */
const mountEditor = () => {
    const style = document.createElement("style");
    style.textContent = `
        .test-scroller { width: 600px; height: 300px; overflow: auto; }
        .test-pm {
            --page-width: 612px;
            --display-margin-scale: 1;
            width: var(--page-width) !important;
            box-sizing: border-box;
            font: 16px monospace;
            line-height: 16px;
            --page-margin-left: 96px;
            --page-margin-right: 96px;
            transform: scale(var(--editor-zoom, 1));
            transform-origin: top center;
        }
        .test-pm p { margin: 0 0 16px 0; padding: 0 calc(96px * var(--display-margin-scale)); }
        .test-pm p.dialogue {
            padding: 0 calc(168px * var(--display-margin-scale)) 0 calc(240px * var(--display-margin-scale));
        }
        .test-pm p.character {
            padding: 0 0 0 calc(336px * var(--display-margin-scale));
            text-transform: uppercase;
        }
        .test-scroller.endless { width: 390px; }
        .test-scroller.endless .test-pm { width: 100% !important; --display-margin-scale: 0.3; }
    `;
    document.head.appendChild(style);

    const scroller = document.createElement("div");
    scroller.className = "test-scroller";
    const editor = document.createElement("div");
    editor.className = "test-pm";
    editor.innerHTML = `
        <p class="scene">INT. TEST STAGE - DAY</p>
        <p class="action">${LONG_LINE}</p>
        <p class="character">a character</p>
        <p class="dialogue">${LONG_LINE}</p>
        <p class="action"></p>
        <p class="action">${LONG_LINE}</p>
    `;
    scroller.appendChild(editor);
    document.body.appendChild(scroller);

    teardown.push(() => {
        scroller.remove();
        style.remove();
    });
    return { scroller, editor };
};

/**
 * The geometry the worker actually consumes: X relative to the page edge and Y
 * relative to the first line, both of which must be scale-independent. Rounded
 * to whole pixels so sub-pixel layout noise doesn't fail the comparison.
 */
const signature = (adapter: PDFAdapter, editor: HTMLElement): string[] => {
    const lines = internals(adapter).collectLines(editor, options);
    const pageLeft = internals(adapter).getPageLeftPx(editor);
    const firstY = lines.find((l) => l.runs.length > 0)?.y ?? 0;
    return lines.map((line) => {
        const text = line.runs.map((r) => r.text).join("");
        const x = line.runs.length > 0 ? Math.round(line.runs[0].x - pageLeft) : 0;
        return `${line.type ?? ""}|${Math.round(line.y - firstY)}|${x}|${text}`;
    });
};

/** Page-relative X of the first line of the given paragraph type, out of a
 *  {@link signature} — its third field. */
const firstX = (lines: string[], type: string): number =>
    Number(lines.find((line) => line.startsWith(`${type}|`))!.split("|")[2]);

describe("PDF export is invariant of the editor's on-screen layout", () => {
    // 0.48 is about what a phone-width viewport fits a US Letter page to; 0.8
    // covers a roomier device so the assertion isn't tied to one ratio.
    for (const scale of [0.48, 0.8]) {
        it(`matches the 1x layout at a paged fit-to-width scale of ${scale}`, () => {
            const adapter = new PDFAdapter();
            const { editor } = mountEditor();

            const canonical = signature(adapter, editor);
            expect(canonical.length).toBeGreaterThan(6); // wrapped, not one line per <p>

            editor.style.setProperty("--editor-zoom", `${scale}`);

            // Guard the test itself: the raw DOM measurements must actually be
            // contaminated by the scale, otherwise nothing is being proven.
            expect(signature(adapter, editor)).not.toEqual(canonical);

            const pinned = internals(adapter).withCanonicalLayout([editor], () => signature(adapter, editor));
            expect(pinned).toEqual(canonical);
        });
    }

    it("matches the page layout in phone endless-scroll mode", () => {
        const adapter = new PDFAdapter();
        const { scroller, editor } = mountEditor();

        const canonical = signature(adapter, editor);
        expect(canonical.length).toBeGreaterThan(6);

        scroller.classList.add("endless");

        // Endless reflows the text into the viewport at 0.3× margins, so the
        // raw measurements must actually be contaminated — the whole layout
        // differs, and every left offset is compressed towards the page edge —
        // otherwise the assertion below proves nothing. (Line *count* is no
        // guard here: the compressed margins widen the dialogue column as much
        // as they narrow the action one, so the totals can coincide.)
        const reflowed = signature(adapter, editor);
        expect(reflowed).not.toEqual(canonical);
        expect(firstX(reflowed, "dialogue")).toBeLessThan(firstX(canonical, "dialogue"));

        const pinned = internals(adapter).withCanonicalLayout([editor], () => signature(adapter, editor));
        expect(pinned).toEqual(canonical);
    });

    it("restores the on-screen layout and scroll position afterwards", () => {
        const adapter = new PDFAdapter();
        const { scroller, editor } = mountEditor();
        scroller.classList.add("endless");
        editor.style.setProperty("opacity", "0.9"); // an unrelated inline style must survive

        const reflowedWidth = editor.getBoundingClientRect().width;
        scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
        const { scrollTop } = scroller;
        expect(scrollTop).toBeGreaterThan(0);

        internals(adapter).withCanonicalLayout([editor], () => signature(adapter, editor));

        expect(editor.getBoundingClientRect().width).toBeCloseTo(reflowedWidth, 1);
        expect(editor.style.transform).toBe("");
        expect(editor.style.width).toBe("");
        expect(editor.style.getPropertyValue("--display-margin-scale")).toBe("");
        expect(editor.style.opacity).toBe("0.9");
        expect(scroller.scrollTop).toBe(scrollTop);
    });

    it("restores the layout even when the measurement throws", () => {
        const adapter = new PDFAdapter();
        const { editor } = mountEditor();
        editor.style.setProperty("--editor-zoom", "0.48");
        const scaledWidth = editor.getBoundingClientRect().width;

        expect(() =>
            internals(adapter).withCanonicalLayout([editor], () => {
                throw new Error("measurement failed");
            }),
        ).toThrow("measurement failed");

        expect(editor.getBoundingClientRect().width).toBeCloseTo(scaledWidth, 1);
    });

    it("keeps inline display overrides the editor itself set", () => {
        const adapter = new PDFAdapter();
        const { editor } = mountEditor();
        editor.style.setProperty("transform", "scale(0.5)", "important");
        editor.style.setProperty("--display-margin-scale", "0.3");

        internals(adapter).withCanonicalLayout([editor], () => signature(adapter, editor));

        expect(editor.style.transform).toBe("scale(0.5)");
        expect(editor.style.getPropertyPriority("transform")).toBe("important");
        expect(editor.style.getPropertyValue("--display-margin-scale")).toBe("0.3");
    });
});
