import { afterEach, describe, expect, it } from "vitest";

import { PDFAdapter, type PDFExportOptions } from "@src/lib/adapters/pdf/pdf-adapter";
import type { VisualLine } from "@src/lib/adapters/pdf/pdf.worker";

/**
 * The PDF exporter reads its geometry from the live editor DOM, which the user
 * can scale on screen (desktop `zoom`, phone paged `transform: scale`). These
 * tests mount a miniature editor, scale it, and assert the collected lines are
 * the same as at 1× — the PDF must not depend on the current zoom level.
 *
 * Runs in real Chromium and WebKit (see vitest.config.ts): the whole point is
 * browser layout, which jsdom cannot provide.
 */

// The adapter's DOM pass is internal; tests reach it directly rather than
// booting a worker + jsPDF to produce a blob.
type AdapterInternals = {
    collectLines(el: HTMLElement, options: PDFExportOptions): VisualLine[];
    withCanonicalScale<T>(elements: (HTMLElement | undefined)[], measure: () => T): T;
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
 * `.ProseMirror` whose scale is driven by the same CSS variables the real
 * stylesheet uses, so pinning it exercises the production code path.
 */
const mountEditor = () => {
    const style = document.createElement("style");
    style.textContent = `
        .test-scroller { width: 600px; height: 300px; overflow: auto; }
        .test-pm {
            width: 612px;
            box-sizing: border-box;
            font: 16px monospace;
            line-height: 16px;
            --page-margin-left: 96px;
            --page-margin-right: 96px;
            zoom: var(--editor-user-zoom, 1);
            transform: scale(var(--editor-zoom, 1));
            transform-origin: top center;
        }
        .test-pm p { margin: 0 0 16px 0; padding: 0 96px; }
        .test-pm p.dialogue { padding: 0 168px 0 240px; }
        .test-pm p.character { padding: 0 0 0 336px; text-transform: uppercase; }
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

describe("PDF export is invariant of the editor zoom level", () => {
    // Desktop zoom (CSS `zoom`) and phone paged mode (`transform: scale`) are
    // the two mechanisms in play; 0.5 also covers WebKit's minimum-font-size
    // clamp, which changes line wrapping under `zoom` and cannot be undone by
    // scaling the numbers afterwards.
    const scales: Array<[string, string, number]> = [
        ["desktop zoom in", "--editor-user-zoom", 1.75],
        ["desktop zoom out", "--editor-user-zoom", 0.5],
        ["phone paged transform", "--editor-zoom", 0.48],
    ];

    for (const [label, variable, value] of scales) {
        it(`matches the 1x layout with ${label} (${value})`, () => {
            const adapter = new PDFAdapter();
            const { editor } = mountEditor();

            const canonical = signature(adapter, editor);
            expect(canonical.length).toBeGreaterThan(6); // wrapped, not one line per <p>

            editor.style.setProperty(variable, `${value}`);

            // Guard the test itself: the raw DOM measurements must actually be
            // contaminated by the scale, otherwise nothing is being proven.
            expect(signature(adapter, editor)).not.toEqual(canonical);

            const pinned = internals(adapter).withCanonicalScale([editor], () => signature(adapter, editor));
            expect(pinned).toEqual(canonical);
        });
    }

    it("restores the on-screen scale and scroll position afterwards", () => {
        const adapter = new PDFAdapter();
        const { scroller, editor } = mountEditor();
        editor.style.setProperty("--editor-user-zoom", "2.5");
        editor.style.setProperty("opacity", "0.9"); // an unrelated inline style must survive

        const scaledWidth = editor.getBoundingClientRect().width;
        scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
        scroller.scrollLeft = scroller.scrollWidth - scroller.clientWidth;
        const { scrollTop, scrollLeft } = scroller;
        expect(scrollTop).toBeGreaterThan(0);
        expect(scrollLeft).toBeGreaterThan(0);

        internals(adapter).withCanonicalScale([editor], () => signature(adapter, editor));

        expect(editor.getBoundingClientRect().width).toBeCloseTo(scaledWidth, 1);
        expect(editor.style.zoom).toBe("");
        expect(editor.style.transform).toBe("");
        expect(editor.style.opacity).toBe("0.9");
        expect(scroller.scrollTop).toBe(scrollTop);
        expect(scroller.scrollLeft).toBe(scrollLeft);
    });

    it("restores the scale even when the measurement throws", () => {
        const adapter = new PDFAdapter();
        const { editor } = mountEditor();
        editor.style.setProperty("--editor-user-zoom", "2");
        const scaledWidth = editor.getBoundingClientRect().width;

        expect(() =>
            internals(adapter).withCanonicalScale([editor], () => {
                throw new Error("measurement failed");
            }),
        ).toThrow("measurement failed");

        expect(editor.getBoundingClientRect().width).toBeCloseTo(scaledWidth, 1);
    });

    it("keeps an inline scale the editor itself set", () => {
        const adapter = new PDFAdapter();
        const { editor } = mountEditor();
        editor.style.setProperty("zoom", "1.5", "important");

        internals(adapter).withCanonicalScale([editor], () => signature(adapter, editor));

        expect(editor.style.zoom).toBe("1.5");
        expect(editor.style.getPropertyPriority("zoom")).toBe("important");
    });
});
