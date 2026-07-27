"use client";

/**
 * Keeps the reader looking at the same line across an editor zoom change.
 *
 * Scaling the scroll offset by the zoom ratio (`centre * factor`) looks right on
 * paper but assumes the document's height scales *exactly* with the zoom — that
 * a point 40 000px down lands at 48 000px at 1.2×. Browsers don't honour that:
 * `zoom` re-lays the page out at scaled font sizes, so per-line rounding (and,
 * on WebKit below ~0.56×, the minimum-font-size clamp changing where lines wrap)
 * leaves the real height slightly off the ideal multiple. The error is per line,
 * so it accumulates with depth — measured at up to ~900px (a page or two) 27
 * pages into a script on WebKit, while Chromium stayed within 5px.
 *
 * So this anchors to content instead of arithmetic, closed-loop: record which
 * block the viewport centre sits in and how far through it, then afterwards
 * measure where that block actually landed and scroll by the difference. No
 * assumption about the scale is made anywhere — it reads the new geometry — so
 * any non-proportional layout change (a re-wrap, a scrollbar appearing, the
 * wrapper's percentage padding) corrects itself.
 *
 * Sibling of {@link useViewModeScrollAnchor}, which does the same for the
 * endless ⇄ paged switch. Kept separate because that one anchors the block at
 * the top of the fold across a mode toggle it doesn't own, while zoom is applied
 * here and wants the viewport centre (the page grows symmetrically around it).
 */

/**
 * Frame budget for re-applying the correction. The zoom doesn't necessarily
 * finish settling in the commit that applies it — a ResizeObserver-driven
 * relayout or a content-visibility subtree becoming relevant can land a frame or
 * two later. Each pass re-measures from scratch, so they converge rather than
 * compound, and the loop stops as soon as the anchor holds still.
 */
const MAX_SETTLE_FRAMES = 5;

/** Frames the anchor must hold still before the layout counts as settled. */
const SETTLED_FRAMES = 2;

/** Below this many px the anchor is where it should be; nothing to correct. */
const SETTLED_EPSILON = 0.5;

export interface ZoomScrollAnchor {
    /** Top-level block the viewport centre sat in before the rescale. */
    el: HTMLElement;
    /** How far through that block the centre sat, as a fraction of its height. */
    ratioY: number;
    /** Where the centre sat across the page, as a fraction of the page width. */
    ratioX: number;
    /**
     * The reader was at the very start of the document. Anchoring the centre
     * there would need to scroll *up* past the top when zooming out, which
     * clamps at 0 and quietly loses the position — so a zoom in and back out
     * would leave them a few lines into the script instead of at the top. The
     * top of the document is a fixed point instead: nothing above it to keep.
     */
    atTop: boolean;
}

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

/**
 * Record what the reader is looking at. Call while the *outgoing* layout is
 * still on screen — i.e. before the zoom variable is applied.
 *
 * Ratios rather than pixel offsets: the block's height and the page's width both
 * change with the zoom, and a fraction of each survives that unchanged, so
 * {@link restoreZoomAnchor} needs no knowledge of the zoom levels involved.
 */
export const captureZoomAnchor = (
    container: HTMLElement,
    editorDom: HTMLElement | null | undefined,
): ZoomScrollAnchor | null => {
    const blocks = editorDom?.children;
    if (!editorDom || !blocks || blocks.length === 0) return null;

    const containerRect = container.getBoundingClientRect();
    const focusY = containerRect.top + container.clientHeight / 2;
    const focusX = containerRect.left + container.clientWidth / 2;

    // First block whose bottom edge is still below the focal line. Binary search
    // rather than a scan: rects are monotonic in document order and a
    // feature-length script has thousands of blocks. The first read flushes
    // layout, so the ~12 that follow are cheap.
    let lo = 0;
    let hi = blocks.length - 1;
    let found = hi;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if ((blocks[mid] as HTMLElement).getBoundingClientRect().bottom > focusY) {
            found = mid;
            hi = mid - 1;
        } else {
            lo = mid + 1;
        }
    }

    // A collapsed block (display:none, e.g. a page break hidden by endless
    // scroll) has no position to come back to and would make the ratio
    // meaningless — step on to the next block that is actually laid out.
    let el = blocks[found] as HTMLElement;
    let rect = el.getBoundingClientRect();
    for (let i = found + 1; rect.height === 0 && i < blocks.length; i++) {
        el = blocks[i] as HTMLElement;
        rect = el.getBoundingClientRect();
    }
    if (rect.height === 0) return null;

    // Signed and unbounded on purpose: when the centre falls in the gap between
    // pages the ratio lands outside [0, 1], which still restores exactly — the
    // block scales with everything around it.
    const pageRect = editorDom.getBoundingClientRect();
    return {
        el,
        ratioY: (focusY - rect.top) / rect.height,
        ratioX: pageRect.width > 0 ? (focusX - pageRect.left) / pageRect.width : 0.5,
        atTop: container.scrollTop < 1,
    };
};

/**
 * Put the anchored content back under the viewport centre, by scrolling the
 * container by however far the new layout moved it. Returns whether it was
 * already in place, i.e. there was nothing to correct.
 */
export const restoreZoomAnchor = (
    container: HTMLElement,
    editorDom: HTMLElement | null | undefined,
    anchor: ZoomScrollAnchor,
): boolean => {
    if (!editorDom || !anchor.el.isConnected) return true;

    const containerRect = container.getBoundingClientRect();
    const rect = anchor.el.getBoundingClientRect();
    const pageRect = editorDom.getBoundingClientRect();

    const deltaY = anchor.atTop
        ? -container.scrollTop
        : rect.top + anchor.ratioY * rect.height - (containerRect.top + container.clientHeight / 2);
    const deltaX = pageRect.left + anchor.ratioX * pageRect.width - (containerRect.left + container.clientWidth / 2);
    if (Math.abs(deltaY) < SETTLED_EPSILON && Math.abs(deltaX) < SETTLED_EPSILON) return true;

    container.scrollTop = clamp(container.scrollTop + deltaY, container.scrollHeight - container.clientHeight);
    container.scrollLeft = clamp(container.scrollLeft + deltaX, container.scrollWidth - container.clientWidth);
    return false;
};

/**
 * Restore now, then keep re-checking for a few frames in case the new layout is
 * still settling. Returns a cancel function for the caller's effect cleanup —
 * call it before starting another zoom so successive steps don't run competing
 * loops.
 */
export const settleZoomAnchor = (
    container: HTMLElement,
    editorDom: HTMLElement | null | undefined,
    anchor: ZoomScrollAnchor,
): (() => void) => {
    restoreZoomAnchor(container, editorDom, anchor);

    let frames = 0;
    let stillFrames = 0;
    let raf = requestAnimationFrame(function settle() {
        stillFrames = restoreZoomAnchor(container, editorDom, anchor) ? stillFrames + 1 : 0;
        // Held still for a couple of frames: the new layout has stopped shifting
        // under us, so stop re-measuring rather than burning the whole budget on
        // a heavy document.
        if (stillFrames >= SETTLED_FRAMES || ++frames >= MAX_SETTLE_FRAMES) return;
        raf = requestAnimationFrame(settle);
    });
    return () => cancelAnimationFrame(raf);
};
