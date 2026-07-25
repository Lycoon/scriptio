import type { Editor } from "@tiptap/react";

/**
 * Focus a screenplay/title editor with the caret dropped on the character at the
 * given client (viewport) coordinates — e.g. the point the user tapped — rather
 * than at the stored selection.
 *
 * On mobile the reader can be scrolled far from wherever the caret last sat, so a
 * plain `editor.commands.focus()` (which restores that old selection and scrolls
 * it into view) makes the whole view jump when entering edit mode. Hit-testing an
 * on-screen point instead keeps the caret visible and the view still as the
 * on-screen keyboard rises.
 *
 * Must be called synchronously inside the entering-edit tap gesture: iOS only
 * raises the keyboard when `focus()` runs in the same user-gesture turn.
 *
 * Callers follow this with {@link centerCaretInView}, which then eases the caret
 * to the middle of the area left visible by the keyboard — a short, smooth scroll
 * from an on-screen position, not the page-length jump a plain focus() would have
 * made from the stale selection.
 */
export const focusEditorAtCoords = (editor: Editor, left: number, top: number) => {
    const coords = editor.view.posAtCoords({ left, top });
    if (coords) {
        // Place the caret on the character under that point. Tiptap resolves the
        // raw position to the nearest valid text selection; it's already visible,
        // so the focus's scroll-into-view is a no-op and nothing jumps.
        editor.commands.focus(coords.pos);
    } else {
        // No node under the point (e.g. an empty/short document, or a tap in a
        // margin) — fall back to the default focus so the keyboard still comes up.
        editor.commands.focus();
    }
};

/**
 * Focus the editor with the caret at a position in the upper part of the visible
 * viewport, rather than at the stored selection. Used when entering edit mode from
 * the pen button, where there's no tap point on the text to aim at — see
 * {@link focusEditorAtCoords} for the shared rationale.
 *
 * Must be called synchronously inside the entering-edit gesture (same reason as
 * focusEditorAtCoords).
 */
export const focusEditorInViewport = (editor: Editor) => {
    if (typeof window === "undefined") {
        editor.commands.focus();
        return;
    }

    const vv = window.visualViewport;
    const width = vv?.width ?? window.innerWidth;
    const height = vv?.height ?? window.innerHeight;
    // Horizontally centered; a quarter of the way down the *visible* viewport —
    // clear of the fixed navbar overlay pinned at the top and well above where the
    // keyboard will rise from the bottom, so the hit-tested point (and the caret
    // we place there) is on screen and stays visible once the keyboard is up.
    const left = (vv?.offsetLeft ?? 0) + width / 2;
    const top = (vv?.offsetTop ?? 0) + height * 0.25;

    focusEditorAtCoords(editor, left, top);
};

/** Quiet spell with no visual-viewport change that counts as "the keyboard is up". */
const KEYBOARD_SETTLE_MS = 150;

/** How long the scroll-padding below stays applied — past the smooth scroll's end. */
const SCROLL_PADDING_MS = 1000;

/** Nearest scrollable ancestor of the caret — the reader's scroll container. */
const findScrollContainer = (from: HTMLElement): HTMLElement | null => {
    for (let node = from.parentElement; node; node = node.parentElement) {
        const overflowY = window.getComputedStyle(node).overflowY;
        if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight + 1) {
            return node;
        }
    }
    return null;
};

/**
 * Teach the scroller what's covering it, so `block: "center"` centers in the band
 * the user can actually see rather than on the whole screen: the fixed navbar
 * overlay at the top — exactly the scroller's own top padding, see
 * EditorPanel.module.css .container — and the keyboard with its format toolbar at
 * the bottom. Without the bottom one the caret lands behind the keyboard.
 *
 * Cleared again shortly after: the scene navigation and search highlight scroll
 * this same container and must not inherit a keyboard-sized offset.
 */
const withVisibleBandPadding = (container: HTMLElement, scroll: () => void) => {
    const vv = window.visualViewport;
    const toolbar = document.querySelector<HTMLElement>('[role="toolbar"]');
    const covered = toolbar
        ? window.innerHeight - toolbar.getBoundingClientRect().top
        : window.innerHeight - (vv ? vv.offsetTop + vv.height : window.innerHeight);

    container.style.scrollPaddingTop = window.getComputedStyle(container).paddingTop;
    container.style.scrollPaddingBottom = `${covered}px`;
    scroll();
    setTimeout(() => {
        container.style.removeProperty("scroll-padding-top");
        container.style.removeProperty("scroll-padding-bottom");
    }, SCROLL_PADDING_MS);
};

/**
 * Smoothly bring the caret to the vertical center of the visible area after
 * entering edit mode on phone, so the user can see at a glance where the focus
 * landed. Call it right after the focus, in the same gesture.
 *
 * It can't scroll straight away: the on-screen keyboard rises over the next few
 * hundred ms and halves the visible area as it does, so centering now would aim at
 * a band that's about to change — and iOS scrolls the container itself to chase the
 * caret meanwhile, which would fight (and cancel) a smooth scroll in flight. So it
 * waits for the viewport to hold still, then scrolls once.
 *
 * A touch cancels it: the user has taken over the scroll and must not be yanked
 * back.
 */
export const centerCaretInView = (editor: Editor) => {
    if (typeof window === "undefined") return;

    const center = () => {
        stop();
        if (editor.isDestroyed) return;
        const { node } = editor.view.domAtPos(editor.state.selection.head);
        const element = node instanceof HTMLElement ? node : node.parentElement;
        if (!element) return;
        const scroll = () => element.scrollIntoView({ behavior: "smooth", block: "center" });
        const container = findScrollContainer(element);
        if (container) withVisibleBandPadding(container, scroll);
        else scroll();
    };

    // Each viewport change (the keyboard growing frame by frame) pushes the scroll
    // back; a quiet spell means it's fully up. With no keyboard at all — a hardware
    // one, or the reader already in edit mode — no event fires and the initial timer
    // is the one that runs.
    let timer = setTimeout(center, KEYBOARD_SETTLE_MS);
    const restart = () => {
        clearTimeout(timer);
        timer = setTimeout(center, KEYBOARD_SETTLE_MS);
    };
    const stop = () => {
        clearTimeout(timer);
        window.visualViewport?.removeEventListener("resize", restart);
        window.removeEventListener("touchstart", stop);
    };

    window.visualViewport?.addEventListener("resize", restart);
    window.addEventListener("touchstart", stop, { passive: true });
};
