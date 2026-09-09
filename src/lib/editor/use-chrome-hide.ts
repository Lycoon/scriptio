"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Editor } from "@tiptap/react";

/**
 * Scroll distance (px) that takes the chrome from fully shown to fully hidden.
 * Several times the navbar height, so a flick eases it away over the length of a
 * natural scroll rather than snapping it shut.
 */
const CHROME_HIDE_RANGE = 220;

/**
 * How far through that range the swipe got, measured only once it is over: past
 * this the chrome finishes hiding, below it it comes back.
 */
const CHROME_SNAP_THRESHOLD = 0.5;

/** Duration (ms) of that run-out — the tail of the swipe, not a separate animation. */
const CHROME_SNAP_MS = 180;

/** How long scrolling must be quiet before the gesture counts as finished. */
const GESTURE_IDLE_MS = 200;

interface ChromeHideOptions {
    /** Phone only — nowhere else does the chrome hide. */
    enabled: boolean;
    /** Edit mode pins it open: the navbar carries the exit/undo/redo controls there. */
    pinned: boolean;
    editor: Editor | null;
    /** Coarse "mostly hidden" flag, for logic that needs a discrete state (see ProjectNavbarMobile). */
    setChromeHidden: (value: boolean) => void;
}

export interface ChromeHideControls {
    /** Feed the clamped scrollTop from the panel's rAF-coalesced scroll handler. */
    onScrollTick: (scrollTop: number) => void;
    /** A finger, or the scroll handle, went down: scrolls are user-driven from here. */
    beginUserScroll: () => void;
    /** It lifted: momentum keeps the flag alive until scrolling settles. */
    endUserScroll: () => void;
    /** Bring the chrome fully back (a single tap, or the user starting to type). */
    reveal: () => void;
}

/**
 * Slide the phone editor's chrome — the navbar, the sidebar edge handles and the
 * pen button — away as the reader scrolls down, and back as they scroll up.
 *
 * It is all one 0→1 progress value, `--chrome-hide`, set on documentElement and
 * consumed by each piece of chrome's own transform and opacity (see the
 * ProjectNavbar, ProjectWorkspace and SplitPanelContainer stylesheets). Two rules
 * govern it, and every function here serves one of them:
 *
 *  1. **While the gesture is live, progress tracks the scroll 1:1.** Nothing
 *     snaps under a finger still on the screen. So the CSS deliberately carries
 *     no transition on the variable, and this is written imperatively rather than
 *     through React state — a re-render per scroll event is what made the chrome
 *     stutter against the finger.
 *  2. **The chrome only ever comes to *rest* fully shown or fully hidden.** Once
 *     the finger is up and its momentum has settled, whatever travel is left runs
 *     out to the nearer end. It is never left stranded half off-screen and half
 *     faded — Google Docs' toolbar settles the same way.
 *
 * "The gesture is over" deliberately does not mean touchend: iOS momentum keeps
 * firing scroll events after the finger lifts, and a real flick must still be
 * able to hide the chrome. An idle timer, pushed out by each of those events,
 * decides when scrolling has actually stopped.
 *
 * Only finger-driven scrolls move the chrome. A programmatic jump ("Go to scene")
 * must not slide the navbar — and with it the open sidebar's dimming backdrop —
 * away under the user, which reads as an unnatural, un-dimmed flash.
 */
export const useChromeHide = ({
    enabled,
    pinned,
    editor,
    setChromeHidden,
}: ChromeHideOptions): ChromeHideControls => {
    const progressRef = useRef(0);
    const snapRafRef = useRef<number | null>(null);
    const isUserScrolling = useRef(false);
    /** True while a finger is genuinely down, so the idle timer can't fire mid-drag. */
    const isFingerDown = useRef(false);
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastScrollTop = useRef(0);

    const apply = useCallback(
        (progress: number) => {
            const clamped = progress < 0 ? 0 : progress > 1 ? 1 : progress;
            if (clamped === progressRef.current) return;
            const wasHidden = progressRef.current > 0.5;
            progressRef.current = clamped;
            document.documentElement.style.setProperty("--chrome-hide", clamped.toFixed(4));
            const isHidden = clamped > 0.5;
            if (isHidden !== wasHidden) setChromeHidden(isHidden);
        },
        [setChromeHidden],
    );

    const cancelSnap = useCallback(() => {
        if (snapRafRef.current == null) return;
        cancelAnimationFrame(snapRafRef.current);
        snapRafRef.current = null;
    }, []);

    /**
     * Run the remaining travel out to `target` (rule 2). Driven by rAF and not a
     * CSS transition because the gesture writes this same variable and the CSS
     * must stay transition-free for rule 1 — a transition would smear every
     * scroll frame instead. While this runs it owns the variable: scroll deltas
     * leave it alone, and a new touch cancels it so the next gesture picks the
     * chrome up mid-flight.
     */
    const snap = useCallback(
        (target: 0 | 1) => {
            cancelSnap();
            const from = progressRef.current;
            if (from === target) return;
            const startedAt = performance.now();
            const step = (now: number) => {
                const t = Math.min(1, (now - startedAt) / CHROME_SNAP_MS);
                // easeOutCubic: leaves fast, reading as a continuation of the
                // swipe's momentum, then settles gently.
                const eased = 1 - (1 - t) ** 3;
                apply(from + (target - from) * eased);
                snapRafRef.current = t < 1 ? requestAnimationFrame(step) : null;
            };
            snapRafRef.current = requestAnimationFrame(step);
        },
        [apply, cancelSnap],
    );

    const reveal = useCallback(() => {
        cancelSnap();
        apply(0);
    }, [apply, cancelSnap]);

    const armIdle = useCallback(() => {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(() => {
            isUserScrolling.current = false;
            // Finger up and its momentum settled: the one moment rule 2 applies.
            const progress = progressRef.current;
            if (snapRafRef.current == null && progress > 0 && progress < 1) {
                snap(progress >= CHROME_SNAP_THRESHOLD ? 1 : 0);
            }
        }, GESTURE_IDLE_MS);
    }, [snap]);

    const beginUserScroll = useCallback(() => {
        cancelSnap();
        isFingerDown.current = true;
        isUserScrolling.current = true;
        if (idleTimer.current) clearTimeout(idleTimer.current);
    }, [cancelSnap]);

    const endUserScroll = useCallback(() => {
        isFingerDown.current = false;
        armIdle();
    }, [armIdle]);

    const onScrollTick = useCallback(
        (scrollTop: number) => {
            const delta = scrollTop - lastScrollTop.current;
            lastScrollTop.current = scrollTop;
            if (!enabled) return;

            // Keep the finger-driven flag alive through iOS momentum: every event
            // after the lift pushes the idle-clear further out.
            if (isUserScrolling.current && !isFingerDown.current) armIdle();

            if (pinned || scrollTop <= 4) {
                reveal();
            } else if (isUserScrolling.current && snapRafRef.current == null) {
                // Skipped while a run-out is in flight so a stray scroll event
                // can't fight it; a real new gesture cancels it on touch-down.
                apply(progressRef.current + delta / CHROME_HIDE_RANGE);
            }
        },
        [enabled, pinned, apply, reveal, armIdle],
    );

    // Reset whenever the chrome can't or shouldn't be hidden — leaving phone
    // layout, entering edit mode — and on unmount, so the next screen never
    // inherits a half-hidden bar.
    useEffect(() => {
        if (!enabled || pinned) reveal();
        return reveal;
    }, [enabled, pinned, reveal]);

    // Bring the chrome back the moment the user starts writing. The native
    // `input` event fires only for real user edits — not for collaboration
    // changes or pagination height updates — so it never fights the scroll-hide.
    useEffect(() => {
        if (!enabled) return;
        const dom = editor?.view?.dom;
        if (!dom) return;
        dom.addEventListener("input", reveal);
        return () => dom.removeEventListener("input", reveal);
    }, [editor, enabled, reveal]);

    useEffect(() => {
        return () => {
            if (idleTimer.current) clearTimeout(idleTimer.current);
            if (snapRafRef.current != null) cancelAnimationFrame(snapRafRef.current);
        };
    }, []);

    // Memoised so callers can depend on the whole object without re-creating
    // their own handlers every render.
    return useMemo(
        () => ({ onScrollTick, beginUserScroll, endUserScroll, reveal }),
        [onScrollTick, beginUserScroll, endUserScroll, reveal],
    );
};
