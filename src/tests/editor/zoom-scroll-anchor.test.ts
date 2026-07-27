import { afterEach, describe, expect, it } from "vitest";

import { captureZoomAnchor, restoreZoomAnchor } from "@src/lib/editor/zoom-scroll-anchor";

/**
 * Zooming the editor must leave the line the reader was looking at under the
 * viewport centre. Runs in real Chromium and WebKit (see vitest.config.ts) —
 * the bug this covers only appears in an engine whose `zoom` relayout isn't a
 * perfect multiple of the previous one, which jsdom cannot model at all.
 *
 * The harness mirrors the editor's structure closely enough for the geometry to
 * be comparable: a page-width `zoom`ed page inside a centred, width-capped
 * wrapper with percentage bottom padding, wrapping paragraphs of varied length,
 * page-break spacers carrying `content-visibility`, and the horizontal overflow
 * swap that the panel applies above 1×.
 */

const PAGE_WIDTH = 612;
const PAGES = 30;
const BREAK_HEIGHT = 260;

/** Max drift (px) we accept: sub-pixel rounding over a long zoom gesture. */
const TOLERANCE = 8;

const teardown: Array<() => void> = [];
afterEach(() => {
    while (teardown.length) teardown.pop()!();
});

const mount = () => {
    const style = document.createElement("style");
    style.textContent = `
        .za-host { width: 700px; height: 420px; overflow-y: auto; overflow-x: clip;
                   scrollbar-gutter: stable; position: relative; }
        .za-host.zoomed-x { overflow-x: auto; }
        .za-wrap { width: 100%; max-width: 1000px; margin: 0 auto; padding-bottom: 30%; contain: layout; }
        .za-host.zoomed-x .za-wrap { width: fit-content; max-width: none; }
        .za-page { width: ${PAGE_WIDTH}px; box-sizing: border-box; margin: 0 auto;
                   font: 16px monospace; line-height: 20px; zoom: var(--editor-user-zoom, 1); }
        .za-page p { margin: 0 0 20px 0; padding: 0 96px; }
        .za-page p.dialogue { padding: 0 168px 0 240px; }
        .za-break { content-visibility: auto; contain-intrinsic-size: none ${BREAK_HEIGHT}px;
                    height: ${BREAK_HEIGHT}px; }
    `;
    document.head.appendChild(style);

    const container = document.createElement("div");
    container.className = "za-host";
    const wrapper = document.createElement("div");
    wrapper.className = "za-wrap";
    const page = document.createElement("div");
    page.className = "za-page";

    const words = "the quick brown fox jumps over a lazy dog while dawn breaks over the quiet valley".split(" ");
    let html = "";
    for (let p = 0; p < PAGES; p++) {
        for (let l = 0; l < 8; l++) {
            const length = 6 + ((p * 7 + l * 5) % 12); // varied paragraph heights
            const text = Array.from({ length }, (_, i) => words[(l + i) % words.length]).join(" ");
            html += `<p id="p${p}l${l}" class="${l % 3 === 0 ? "dialogue" : "action"}">${text}</p>`;
        }
        if (p < PAGES - 1) html += `<div class="za-break"></div>`;
    }
    page.innerHTML = html;
    wrapper.appendChild(page);
    container.appendChild(wrapper);
    document.body.appendChild(container);

    teardown.push(() => {
        container.remove();
        style.remove();
    });
    return { container, page };
};

/** Signed distance (px) from the viewport centre to the target line's middle. */
const drift = (container: HTMLElement, target: HTMLElement) => {
    const centre = container.getBoundingClientRect().top + container.clientHeight / 2;
    const rect = target.getBoundingClientRect();
    return rect.top + rect.height / 2 - centre;
};

/** What the panel's layout effect does: capture, apply the scale, restore. */
const applyZoom = (container: HTMLElement, page: HTMLElement, zoom: number) => {
    const anchor = captureZoomAnchor(container, page);
    container.classList.toggle("zoomed-x", zoom > 1);
    container.style.setProperty("--editor-user-zoom", `${zoom}`);
    if (!anchor) return;
    // The panel re-checks over a few frames (settleZoomAnchor); synchronously
    // the loop converges immediately, so a bounded retry stands in for it here.
    for (let pass = 0; pass < 3 && !restoreZoomAnchor(container, page, anchor); pass++);
};

describe("editor zoom keeps the reading position", () => {
    // A full keyboard gesture: in to 1.73x, back through 1x, out to the 0.5x
    // floor, then reset. 0.5x matters because WebKit clamps the shrunk font to a
    // 9px rendered minimum, which changes where lines wrap.
    const gesture = [1.2, 1.44, 1.73, 1.44, 1, 0.83, 0.69, 0.58, 0.5, 1];

    // Depth is the point: the old multiplicative anchoring drifted per line, so
    // the error grew the further into the script the reader was. (Page 0 is
    // excluded — a line that close to the top can't be brought to the viewport
    // centre at all, since scrollTop clamps at 0; see the test below it.)
    for (const depth of [5, 14, 27]) {
        it(`holds the centred line through a zoom gesture on page ${depth}`, () => {
            const { container, page } = mount();
            const target = page.querySelector<HTMLElement>(`#p${depth}l4`)!;
            container.scrollTop += drift(container, target);

            const worst = { zoom: 1, drift: 0 };
            for (const zoom of gesture) {
                applyZoom(container, page, zoom);
                const d = drift(container, target);
                if (Math.abs(d) > Math.abs(worst.drift)) {
                    worst.zoom = zoom;
                    worst.drift = d;
                }
            }

            expect(Math.abs(worst.drift), `worst drift ${worst.drift}px at ${worst.zoom}x`).toBeLessThan(TOLERANCE);
        });
    }

    it("stays at the top of the document instead of scrolling into it", () => {
        const { container, page } = mount();
        expect(container.scrollTop).toBe(0);

        // Nothing above the first line to reveal, so the correction must clamp
        // rather than push the reader down into the script.
        for (const zoom of gesture) applyZoom(container, page, zoom);

        expect(container.scrollTop).toBe(0);
    });

    it("anchors on the block under the viewport centre", () => {
        const { container, page } = mount();
        const target = page.querySelector<HTMLElement>("#p9l4")!;
        container.scrollTop += drift(container, target);

        const anchor = captureZoomAnchor(container, page);
        expect(anchor?.el.id).toBe("p9l4");
        // The centre sits on the line's middle, so mid-block vertically.
        expect(anchor!.ratioY).toBeGreaterThan(0);
        expect(anchor!.ratioY).toBeLessThan(1);
        // Horizontally the viewport centre is the page centre (margin: 0 auto).
        expect(anchor!.ratioX).toBeCloseTo(0.5, 1);
    });

    it("reports settled when nothing moved, and needs no editor DOM", () => {
        const { container, page } = mount();
        container.scrollTop += drift(container, page.querySelector<HTMLElement>("#p3l4")!);

        const anchor = captureZoomAnchor(container, page)!;
        expect(restoreZoomAnchor(container, page, anchor)).toBe(true);
        expect(captureZoomAnchor(container, null)).toBeNull();
        expect(captureZoomAnchor(container, undefined)).toBeNull();
    });

    it("survives the anchored block being removed mid-zoom", () => {
        const { container, page } = mount();
        const target = page.querySelector<HTMLElement>("#p7l4")!;
        container.scrollTop += drift(container, target);

        const anchor = captureZoomAnchor(container, page)!;
        const before = container.scrollTop;
        anchor.el.remove();
        // Disconnected anchor: report settled and leave the scroll alone rather
        // than scrolling to a stale position.
        expect(restoreZoomAnchor(container, page, anchor)).toBe(true);
        expect(container.scrollTop).toBe(before);
    });
});
