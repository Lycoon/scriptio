"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";

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
 * the switch, record which block sits at the top of the viewport and how far into
 * it we are; afterwards, scroll by however far the new layout moved that block.
 * Everything here runs on a toggle only — never during scrolling or typing.
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
    const anchorRef = useRef<{ el: HTMLElement; offset: number } | null>(null);

    // Runs synchronously before the mode flips, so the outgoing layout is still
    // on screen and measurable.
    const capture = useCallback(() => {
        anchorRef.current = null;
        const dom = editor && !editor.isDestroyed ? (editor.view?.dom as HTMLElement | undefined) : undefined;
        if (!container || !dom) return;

        // Only blocks that exist in BOTH modes make usable anchors: the page-break
        // widgets are display:none in endless, so one picked here would have no
        // position to come back to — and its collapsed rect would also break the
        // monotonic ordering the search below relies on.
        const blocks = (Array.from(dom.children) as HTMLElement[]).filter(
            (child) => !child.classList.contains(PAGE_BREAK_CLASS),
        );
        if (blocks.length === 0) return;

        // First block whose bottom edge is still below the top of the visible
        // area. Binary search rather than a scan: rects are monotonic in document
        // order, and a feature-length script has thousands of blocks. The first
        // read flushes layout, so the ~12 that follow are cheap.
        const containerTop = container.getBoundingClientRect().top;
        let lo = 0;
        let hi = blocks.length - 1;
        let found = blocks.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (blocks[mid].getBoundingClientRect().bottom > containerTop) {
                found = mid;
                hi = mid - 1;
            } else {
                lo = mid + 1;
            }
        }

        // A block split across a page boundary (a dialogue running over with
        // MORE/CONT'D) hosts its break widget *inside* itself, so its own height
        // changes with the mode and a position partway into it wouldn't map
        // across. Step past those to the next unsplit block — the offset below is
        // signed and relative to the viewport top, so anchoring to a block under
        // the fold restores just as exactly as one at the fold.
        while (found < blocks.length - 1 && blocks[found].querySelector(`.${PAGE_BREAK_CLASS}`)) found++;

        const el = blocks[found];
        // Signed: negative when the block starts above the fold (we're partway
        // through it), so the same line — not merely the same block — comes back.
        anchorRef.current = { el, offset: el.getBoundingClientRect().top - containerTop };
    }, [container, editor]);

    // Subscribe through a ref so a new container/editor identity doesn't churn the
    // subscription — the callback is only ever invoked on a toggle anyway.
    const captureRef = useRef(capture);
    useEffect(() => {
        captureRef.current = capture;
    }, [capture]);

    useEffect(() => onBeforeChange(() => captureRef.current()), [onBeforeChange]);

    /**
     * Put the anchored block back where it was, by scrolling the container by
     * however far the new layout moved it. Returns whether it was already in
     * place, i.e. there was nothing to correct.
     */
    const restore = useCallback((): boolean => {
        const anchor = anchorRef.current;
        if (!container || !anchor || !anchor.el.isConnected) return true;

        const delta = anchor.el.getBoundingClientRect().top - container.getBoundingClientRect().top - anchor.offset;
        if (Math.abs(delta) < SETTLED_EPSILON) return true;
        const maxScroll = container.scrollHeight - container.clientHeight;
        container.scrollTop = Math.max(0, Math.min(maxScroll, container.scrollTop + delta));
        return false;
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
