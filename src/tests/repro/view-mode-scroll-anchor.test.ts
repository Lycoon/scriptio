import { describe, it, expect, afterEach } from "vitest";

import { applyViewModeAnchor, captureViewModeAnchor } from "@src/lib/editor/use-view-mode-scroll-anchor";

/**
 * Regression guard for the reading position across the endless ⇄ paged switch.
 *
 * Real layout, so this runs in the browser instances (chromium + webkit) and
 * exercises the two shapes the switch actually takes:
 *
 *  - tablet/desktop: both modes lay the text out identically and the only
 *    difference is that paged reinstates the page-break widgets. Pinning the
 *    *top* of the viewport was therefore exact and still slid the reader: every
 *    boundary that falls on screen pushes everything below it down by a whole
 *    spacer, so a block in the middle came back near the bottom.
 *  - phone: endless additionally reflows to a compact measure at full font size
 *    while paged renders the canonical page under a transform: scale(), so the
 *    same block is a very different height in each.
 *
 * Both are checked against the same invariant: whatever was under the middle of
 * the viewport is still under it afterwards.
 */

const VIEWPORT_H = 700;
const NAVBAR_PAD = 56;
/** Bottom margin + inter-page gap + top margin of a page-break widget. */
const BREAK_H = 212;
const BLOCKS_PER_PAGE = 12;
const PAGES = 10;
/** A block's height in paged (canonical) layout. */
const BLOCK_H = 32;
/** …and in phone endless, where the narrow measure wraps it onto more lines. */
const BLOCK_H_REFLOWED = 96;
const PHONE_ZOOM = 0.47;

type Kind = "tablet" | "phone";

interface Harness {
    container: HTMLElement;
    blocks: HTMLElement[];
    /** Viewport y of the point the reader is looking at. */
    focus: () => number;
    /** Viewport y of a block's middle. */
    middleOf: (block: HTMLElement) => number;
    setPaged: () => void;
    cleanup: () => void;
}

const style = document.createElement("style");
style.textContent = `
    .vma_container { position: absolute; top: 0; left: 0; overflow-y: auto; overflow-x: hidden; }
    .vma_container.phone { width: 390px; padding-top: ${NAVBAR_PAD}px; }
    .vma_container.tablet { width: 900px; }
    .vma_pm { width: 816px; margin: 0 auto; }
    .vma_pm > p { height: ${BLOCK_H}px; margin: 0; }

    /* Endless hides every inter-page break. */
    .vma_wrapper.endless .pagination-page-break { display: none; }

    /* Phone endless: fill the width and reflow onto more lines. */
    .vma_wrapper.phone.endless .vma_pm { width: 100%; }
    .vma_wrapper.phone.endless .vma_pm > p { height: ${BLOCK_H_REFLOWED}px; }

    /* Phone paged: the canonical page scaled down to fit, with the (1 − zoom)
       tail of the layout height collapsed away — as in EditorPanel.module.css. */
    .vma_wrapper.phone:not(.endless) .vma_pm {
        transform: scale(${PHONE_ZOOM});
        transform-origin: top center;
        margin-bottom: calc((${PHONE_ZOOM} - 1) * var(--layout-height, 0px));
    }
`;
document.head.appendChild(style);

const widget = (cls: string, height: number) => {
    const el = document.createElement("div");
    el.className = cls;
    el.contentEditable = "false";
    el.style.height = `${height}px`;
    return el;
};

/**
 * A document of PAGES pages: a first-page spacer, then blocks with a page-break
 * widget at every page boundary, then the last-page spacer.
 */
function build(kind: Kind): Harness {
    const container = document.createElement("div");
    container.className = `vma_container ${kind}`;
    container.style.height = `${VIEWPORT_H}px`;

    const wrapper = document.createElement("div");
    wrapper.className = `vma_wrapper ${kind} endless`;

    const pm = document.createElement("div");
    pm.className = "vma_pm";

    pm.appendChild(widget("pagination-first-page", 96));
    const blocks: HTMLElement[] = [];
    for (let i = 0; i < PAGES * BLOCKS_PER_PAGE; i++) {
        if (i > 0 && i % BLOCKS_PER_PAGE === 0) pm.appendChild(widget("pagination-page-break", BREAK_H));
        const p = document.createElement("p");
        p.setAttribute("data-id", `b${i}`);
        p.textContent = `block ${i}`;
        pm.appendChild(p);
        blocks.push(p);
    }
    pm.appendChild(widget("pagination-last-page", 96));

    wrapper.appendChild(pm);
    container.appendChild(wrapper);
    document.body.appendChild(container);

    return {
        container,
        blocks,
        focus: () => container.getBoundingClientRect().top + container.clientHeight / 2,
        middleOf: (block) => {
            const rect = block.getBoundingClientRect();
            return rect.top + rect.height / 2;
        },
        setPaged: () => {
            wrapper.classList.remove("endless");
            // Mirrors DocumentEditorPanel's layout effect, which publishes the
            // untransformed height before the anchor is re-applied.
            if (kind === "phone") container.style.setProperty("--layout-height", `${pm.offsetHeight}px`);
        },
        cleanup: () => container.remove(),
    };
}

/** The hook's rAF settle loop, run synchronously — layout is flushed per read. */
const settle = (harness: Harness, anchor: ReturnType<typeof captureViewModeAnchor>) => {
    for (let i = 0; i < 5; i++) {
        if (applyViewModeAnchor(harness.container, anchor!)) break;
    }
};

/** Scroll so a block's middle sits exactly under the focal point. */
const stareAt = (harness: Harness, block: HTMLElement) => {
    harness.container.scrollTop += harness.middleOf(block) - harness.focus();
};

let active: Harness | null = null;
afterEach(() => {
    active?.cleanup();
    active = null;
});

describe("view-mode scroll anchor", () => {
    for (const kind of ["tablet", "phone"] as Kind[]) {
        it(`keeps the block under the reader's eye in place (${kind})`, () => {
            const harness = (active = build(kind));
            // Deep enough into the script that several page boundaries — and on
            // phone the whole reflow difference — have accumulated above.
            const target = harness.blocks[BLOCKS_PER_PAGE * 5 + 6];
            stareAt(harness, target);

            const anchor = captureViewModeAnchor(harness.container, harness.container.querySelector(".vma_pm")!);
            expect(anchor).not.toBeNull();

            harness.setPaged();

            // The scenario has to be a real one: carrying the scroll position
            // across untouched moves the block far off the focal point.
            expect(Math.abs(harness.middleOf(target) - harness.focus())).toBeGreaterThan(100);

            settle(harness, anchor);
            expect(harness.middleOf(target) - harness.focus()).toBeLessThan(2);
            expect(harness.middleOf(target) - harness.focus()).toBeGreaterThan(-2);
        });
    }

    it("anchors to a neighbour when the reader's block straddles a page boundary", () => {
        const harness = (active = build("tablet"));
        const target = harness.blocks[BLOCKS_PER_PAGE * 4 + 3];
        // A block split mid-way across a boundary hosts the break widget inside
        // itself, so its own height is mode-dependent and it can't be anchored to.
        const split = widget("pagination-page-break", BREAK_H);
        target.appendChild(split);
        stareAt(harness, target);

        const anchor = captureViewModeAnchor(harness.container, harness.container.querySelector(".vma_pm")!);
        expect(anchor).not.toBeNull();
        expect(anchor!.el).not.toBe(target);
        // …and to one right next to it, not to some far-away fallback.
        expect(Math.abs(harness.blocks.indexOf(anchor!.el) - harness.blocks.indexOf(target))).toBe(1);

        harness.setPaged();
        settle(harness, anchor);

        // The neighbour is pinned exactly; the reader's own block is off by at
        // most what the two modes disagree about over one block.
        expect(Math.abs(harness.middleOf(target) - harness.focus())).toBeLessThan(BLOCK_H + BREAK_H);
    });

    it("re-resolves the anchored block when its DOM is recreated by the switch", () => {
        const harness = (active = build("tablet"));
        const target = harness.blocks[BLOCKS_PER_PAGE * 3 + 4];
        stareAt(harness, target);

        const pm = harness.container.querySelector(".vma_pm") as HTMLElement;
        const anchor = captureViewModeAnchor(harness.container, pm);
        harness.setPaged();

        // Pagination redraws by replacing decorations, which can swap the whole
        // element out from under the captured reference.
        const replacement = anchor!.el.cloneNode(true) as HTMLElement;
        anchor!.el.replaceWith(replacement);

        settle(harness, anchor);
        expect(Math.abs(harness.middleOf(replacement) - harness.focus())).toBeLessThan(2);
    });
});
