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
