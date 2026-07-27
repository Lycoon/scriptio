"use client";

import { useEffect } from "react";
import type { Editor } from "@tiptap/react";

import { coveredBottomBand } from "./visible-band";

/** Breathing room kept between the caret's line and the top of that chrome. */
const CARET_GAP = 12;

/**
 * How long after focus to re-measure. The format toolbar is mounted in reaction
 * to the editor focusing, so it isn't in the DOM yet when the focus event fires
 * and the band measured then is ~a toolbar short.
 */
const TOOLBAR_SETTLE_MS = 250;

interface KeyboardCaretVisibilityOptions {
    /** The panel's scroll container (`.container` in EditorPanel.module.css). */
    container: HTMLElement | null;
    editor: Editor | null;
    /** Phone, in edit mode — nowhere else can the keyboard cover the editor. */
    enabled: boolean;
}

/**
 * Keep the line being written clear of the on-screen keyboard and the
 * MobileFormatToolbar riding on it. Two things are needed, and neither happens
 * on its own:
 *
 *  - **Room to scroll into.** The shell is pinned to the layout viewport and the
 *    keyboard just covers its bottom, so the script's last lines sit *behind* the
 *    keyboard with nothing below them to scroll up — the wrapper's fixed tail
 *    (40% of its width, ~150px on a phone) is far shorter than a keyboard.
 *    `--keyboard-inset` adds exactly the covered height to that tail while the
 *    keyboard is up; `.editor_wrapper` inherits it from the scroll container and
 *    folds it into its bottom padding, so the end of the script can always be
 *    brought above the chrome.
 *  - **Something to do the scrolling.** WebKit does chase the caret, but it aims
 *    at the visual viewport and knows nothing about the toolbar floating over it,
 *    so it parks the caret behind the bar; and when the container can't scroll
 *    far enough it scrolls the *document* instead, which the shell's anchoring
 *    guard (see ProjectWorkspace) snaps straight back — leaving the caret hidden.
 *    So after every caret move we measure and top the scroll up ourselves.
 *
 * Only ever scrolls *down*, and only in reaction to an edit or a caret move, so a
 * reader who scrolls away from their own caret is never yanked back to it.
 */
export const useKeyboardCaretVisibility = ({
    container,
    editor,
    enabled,
}: KeyboardCaretVisibilityOptions) => {
    useEffect(() => {
        if (!enabled || !container || !editor || typeof window === "undefined") return;

        let frame: number | null = null;
        let settleTimer: ReturnType<typeof setTimeout> | null = null;

        const update = () => {
            frame = null;
            if (editor.isDestroyed) return;

            const covered = coveredBottomBand();
            // The reserved room tracks the keyboard alone, not this editor's
            // focus: a tap on the toolbar blurs the contenteditable for a tick,
            // and dropping the padding in that gap would clamp the scroll and
            // jerk the page down under the finger.
            if (covered > 0) container.style.setProperty("--keyboard-inset", `${covered}px`);
            else container.style.removeProperty("--keyboard-inset");

            // The scroll, on the other hand, must only follow a caret that is
            // really being written in — another field (the screenplay search) can
            // own the keyboard while this editor holds a stale selection.
            if (covered <= 0 || !editor.isFocused) return;

            let caretBottom: number;
            try {
                caretBottom = editor.view.coordsAtPos(editor.state.selection.head).bottom;
            } catch {
                // Position not rendered yet (a collaboration edit mid-flight);
                // the next caret move measures again.
                return;
            }
            const overflow = caretBottom - (window.innerHeight - covered - CARET_GAP);
            if (overflow > 0) container.scrollTop += overflow;
        };

        // Coalesce to one measurement per frame: a keystroke fires both a
        // selection update and an input event, and the keyboard rising fires a
        // burst of viewport resizes.
        const schedule = () => {
            if (frame == null) frame = requestAnimationFrame(update);
        };

        const onFocus = () => {
            schedule();
            if (settleTimer) clearTimeout(settleTimer);
            settleTimer = setTimeout(schedule, TOOLBAR_SETTLE_MS);
        };

        const dom = editor.view.dom;
        editor.on("selectionUpdate", schedule);
        editor.on("focus", onFocus);
        // Catches edits that push the caret down without moving it in the
        // document — text wrapping onto a new visual line.
        dom.addEventListener("input", schedule);
        // The keyboard opening, closing, or being swapped for a taller one.
        window.visualViewport?.addEventListener("resize", schedule);
        schedule();

        return () => {
            if (frame != null) cancelAnimationFrame(frame);
            if (settleTimer) clearTimeout(settleTimer);
            editor.off("selectionUpdate", schedule);
            editor.off("focus", onFocus);
            dom.removeEventListener("input", schedule);
            window.visualViewport?.removeEventListener("resize", schedule);
            container.style.removeProperty("--keyboard-inset");
        };
    }, [container, editor, enabled]);
};
