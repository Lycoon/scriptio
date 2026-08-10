"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";

import { coveredBottomBand } from "./visible-band";

// useLayoutEffect warns on the server; fall back to useEffect there. The
// correction must run before paint, so it needs the layout variant in the browser.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Frame budget for re-applying the correction after the switch. The mode change
 * doesn't necessarily finish settling in the commit that triggers it — a
 * ResizeObserver-driven scale or a widget's deferred rendering can land a frame
 * or two later — so a single pass could be measured against a half-settled
 * layout. Each pass re-measures from scratch, so they converge rather than
 * compound, and the loop stops as soon as the anchor holds still.
 */
const MAX_SETTLE_FRAMES = 5;

/** Frames the anchor must hold still before the layout counts as settled. */
const SETTLED_FRAMES = 2;

/** Below this many px the anchor is where it should be; nothing to correct. */
const SETTLED_EPSILON = 0.5;

/** Class of the page-break widgets, which endless-scroll mode hides entirely. */
const PAGE_BREAK_CLASS = "pagination-page-break";

/**
 * Pagination's widget decorations. They are direct children of the editor DOM,
 * interleaved with the real blocks, and none of them is a usable anchor: the
 * page breaks are display:none in endless, and the first/last-page widgets are
 * pure spacers whose height is itself mode-dependent (endless collapses the last
 * page's freespace down to the bottom margin). Their collapsed rects would also
 * break the monotonic ordering the search below relies on.
 *
 * The page-start *classes* pagination puts on real paragraphs
 * (pagination-doc-start / pagination-break-start) are deliberately not listed —
 * those are content, and among the best anchors on a page.
 */
const WIDGET_CLASSES = [PAGE_BREAK_CLASS, "pagination-first-page", "pagination-last-page", "page-lock-marker"];

const isWidget = (el: HTMLElement) => WIDGET_CLASSES.some((cls) => el.classList.contains(cls));

/**
 * A block split across a page boundary (a dialogue running over with
 * MORE/CONT'D) hosts its break widget *inside* itself, so its own height changes
 * with the mode and a position partway into it wouldn't map across.
 */
const hostsSplitBreak = (el: HTMLElement) => el.querySelector(`.${PAGE_BREAK_CLASS}`) !== null;

/**
 * Where the reader is looking, as a viewport y coordinate: the middle of the
 * band of the scroll viewport they can actually see.
 *
 * Pinning the *top edge* instead — what this hook did at first — is what still
 * let the content slide. The top edge is not where the eye is, and every layout
 * difference between the two modes accumulates between the pinned point and
 * whatever is actually being read: paged mode reinstates a whole page-break
 * widget (bottom margin + gap + top margin + freespace) wherever a boundary
 * falls, so a block halfway down the screen came back a screen-third lower even
 * though the correction was, strictly speaking, exact. Anchoring on the middle
 * puts the residual error at the edges, where the eye isn't.
 *
 * The band is the scroll viewport minus whatever covers its bottom — an
 * on-screen keyboard and the format bar riding on it (coveredBottomBand, the
 * same measure the caret follow and that bar itself position against). On a
 * tablet the view-mode toggle lives in exactly that bar, so this switch is
 * routinely made with a keyboard up and half the viewport not being looked at.
 * The scroller's navbar-height top padding on phone is *not* discounted: the bar
 * is a narrow overlay and the content genuinely scrolls, visibly, under it.
 */
const focalPoint = (container: HTMLElement) => {
    const top = container.getBoundingClientRect().top;
    const covered = coveredBottomBand();
    const viewportBottom = top + container.clientHeight;
    // Never above `top`: a keyboard covering the whole scroller leaves no band to
    // take a middle of, and the top edge is the sane degenerate answer.
    const bottom = Math.max(top, covered > 0 ? Math.min(viewportBottom, window.innerHeight - covered) : viewportBottom);
    return (top + bottom) / 2;
};

/**
 * A reading position expressed as content rather than as a pixel offset: which
 * block the reader is looking at, and how far into it.
 */
export interface ViewModeAnchor {
    el: HTMLElement;
    /** data-id of the block, to re-resolve `el` if its DOM gets recreated. */
    id: string | null;
    /**
     * How far into the block the focal point falls, as a fraction of its height.
     * A fraction rather than a pixel depth because the block itself is not the
     * same height in both modes — on phone, endless reflows it to a narrow
     * measure at full font size while paged renders the canonical page scaled
     * down — and a paragraph that goes from five lines to two still comes back
     * showing the part of itself that was being read.
     */
    ratio: number;
    /**
     * Leftover distance from that point to the focal point, non-zero only when
     * the focal point isn't inside the block at all (the split-block skip below
     * can push the anchor a block away). Pins the block's near edge, as the
     * first version of this did.
     */
    offset: number;
}

/**
 * Nearest block to the focal point that isn't split across a page boundary,
 * searching outwards from `from` in both directions. -1 if every block is split.
 */
const nearestUnsplit = (blocks: HTMLElement[], from: number, focus: number): number => {
    if (!hostsSplitBreak(blocks[from])) return from;

    let before = from - 1;
    while (before >= 0 && hostsSplitBreak(blocks[before])) before--;
    let after = from + 1;
    while (after < blocks.length && hostsSplitBreak(blocks[after])) after++;

    if (before < 0) return after < blocks.length ? after : -1;
    if (after >= blocks.length) return before;

    // Whichever is closer: the residual error is whatever the two modes disagree
    // about over the gap between the anchor and the focal point, so the shorter
    // gap wins.
    const gapBefore = focus - blocks[before].getBoundingClientRect().bottom;
    const gapAfter = blocks[after].getBoundingClientRect().top - focus;
    return gapAfter < gapBefore ? after : before;
};

/**
 * Record what the reader is looking at. Must run while the outgoing layout is
 * still on screen, i.e. synchronously before the mode flips.
 */
export const captureViewModeAnchor = (container: HTMLElement, dom: HTMLElement): ViewModeAnchor | null => {
    const blocks = (Array.from(dom.children) as HTMLElement[]).filter((child) => !isWidget(child));
    if (blocks.length === 0) return null;

    const focus = focalPoint(container);

    // First block whose bottom edge is past the focal point, i.e. the block the
    // reader's eye is on. Binary search rather than a scan: rects are monotonic
    // in document order, and a feature-length script has thousands of blocks.
    // The first read flushes layout, so the ~12 that follow are cheap.
    let lo = 0;
    let hi = blocks.length - 1;
    let found = blocks.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (blocks[mid].getBoundingClientRect().bottom > focus) {
            found = mid;
            hi = mid - 1;
        } else {
            lo = mid + 1;
        }
    }

    const index = nearestUnsplit(blocks, found, focus);
    if (index < 0) return null;

    const el = blocks[index];
    const rect = el.getBoundingClientRect();
    // Clamped: when the skip above moved the anchor off the focal point, the
    // leftover distance goes to `offset` instead of distorting the fraction.
    const ratio = rect.height > 0 ? Math.min(1, Math.max(0, (focus - rect.top) / rect.height)) : 0;
    return {
        el,
        id: el.getAttribute("data-id"),
        ratio,
        offset: focus - (rect.top + ratio * rect.height),
    };
};

/**
 * Put the anchored reading position back under the focal point, by scrolling the
 * container by however far the new layout moved it. Returns whether it was
 * already in place, i.e. there was nothing to correct.
 */
export const applyViewModeAnchor = (container: HTMLElement, anchor: ViewModeAnchor): boolean => {
    // Re-resolve when the block's DOM was recreated under us: pagination redraws
    // by replacing widget and node decorations, so the captured element can be
    // detached by the time the new mode is laid out. Treating that as "nothing to
    // correct" is what would silently drop the whole correction.
    if (!anchor.el.isConnected) {
        const replacement = anchor.id
            ? (container.querySelector(`[data-id="${CSS.escape(anchor.id)}"]`) as HTMLElement | null)
            : null;
        if (!replacement) return true;
        anchor.el = replacement;
    }

    const rect = anchor.el.getBoundingClientRect();
    const delta = rect.top + anchor.ratio * rect.height + anchor.offset - focalPoint(container);
    if (Math.abs(delta) < SETTLED_EPSILON) return true;

    const maxScroll = container.scrollHeight - container.clientHeight;
    const next = Math.max(0, Math.min(maxScroll, container.scrollTop + delta));
    // Clamped at either end — the document simply isn't long enough to put the
    // anchor back. Report it settled so the loop stops instead of burning its
    // whole budget re-measuring a correction it can't apply.
    if (next === container.scrollTop) return true;
    container.scrollTop = next;
    return false;
};

interface ViewModeScrollAnchorOptions {
    /** The scroll container whose reading position must be preserved. */
    container: HTMLElement | null;
    editor: Editor | null;
    /** The view mode. Any change re-anchors; the value itself is opaque. */
    viewMode: unknown;
    /**
     * Registers a callback fired synchronously *before* `viewMode` changes, while
     * the outgoing layout is still on screen. Must return an unsubscribe.
     */
    onBeforeChange: (callback: () => void) => () => void;
}

/**
 * Keeps the reader looking at the same place in the document across a view-mode
 * switch (endless scroll ⇄ paged).
 *
 * The two modes render the same document at very different heights: paged keeps
 * a page-break widget between every page (freespace + bottom margin + gap + top
 * margin — easily an inch or two of spacer each), endless hides them, and on
 * phone endless additionally reflows the text to a compact measure. So carrying
 * the raw scrollTop across lands somewhere else entirely, and because the
 * difference accumulates page by page the drift grows the deeper into the script
 * you are — a switch near the end can be pages off.
 *
 * The fix is to preserve the *content* rather than a pixel offset: just before
 * the switch, record which block the reader is looking at and how far into it;
 * afterwards, scroll by however far the new layout moved that point. Everything
 * here runs on a toggle only — never during scrolling or typing.
 *
 * Both phases are layout-phase, so the correction lands before the browser paints
 * and is never seen as a jump. Callers whose own effects change the mode's layout
 * (a marker class, a scale variable) must therefore run them in the layout phase
 * too, and declare them *before* this hook.
 */
export const useViewModeScrollAnchor = ({
    container,
    editor,
    viewMode,
    onBeforeChange,
}: ViewModeScrollAnchorOptions) => {
    const anchorRef = useRef<ViewModeAnchor | null>(null);

    // Runs synchronously before the mode flips, so the outgoing layout is still
    // on screen and measurable.
    const capture = useCallback(() => {
        anchorRef.current = null;
        const dom = editor && !editor.isDestroyed ? (editor.view?.dom as HTMLElement | undefined) : undefined;
        if (!container || !dom) return;
        anchorRef.current = captureViewModeAnchor(container, dom);
    }, [container, editor]);

    // Subscribe through a ref so a new container/editor identity doesn't churn the
    // subscription — the callback is only ever invoked on a toggle anyway.
    const captureRef = useRef(capture);
    useEffect(() => {
        captureRef.current = capture;
    }, [capture]);

    useEffect(() => onBeforeChange(() => captureRef.current()), [onBeforeChange]);

    const restore = useCallback((): boolean => {
        const anchor = anchorRef.current;
        if (!container || !anchor) return true;
        return applyViewModeAnchor(container, anchor);
    }, [container]);

    const prevModeRef = useRef(viewMode);
    useIsoLayoutEffect(() => {
        // Only react to a real mode change — not to the first mount (nothing was
        // captured then, and the document opens at the top anyway), and not to
        // this effect re-running because the scroll container remounted.
        if (prevModeRef.current === viewMode) return;
        prevModeRef.current = viewMode;
        if (!anchorRef.current) return;
        restore();

        let frames = 0;
        let stillFrames = 0;
        let raf = requestAnimationFrame(function settle() {
            stillFrames = restore() ? stillFrames + 1 : 0;
            // Held still for a couple of frames: the new layout has stopped
            // shifting under us, so stop re-measuring rather than burning the
            // whole budget on a heavy document.
            if (stillFrames >= SETTLED_FRAMES || ++frames >= MAX_SETTLE_FRAMES) return;
            raf = requestAnimationFrame(settle);
        });
        return () => cancelAnimationFrame(raf);
    }, [viewMode, restore]);
};
