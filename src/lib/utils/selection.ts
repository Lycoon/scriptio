/**
 * Drop a DOM selection that a tap has parked in the app's chrome.
 *
 * WebKit's default action for a mouse-down on ordinary, selectable content is to
 * place a collapsed selection at the nearest position, and on iOS every tap is a
 * synthetic mouse-down. A tap on the drawer backdrop or an edge toggle therefore
 * used to leave a caret inside a fixed, invisible chrome element, outside any
 * editable root. On iOS that caret is not inert: after every layout and every
 * overflow scroll WebKit recomputes selection-dependent editor state from it, and
 * with no word anywhere in the document for its text searches to stop at, each
 * recomputation walks the whole page. Measured on-device (September 2026) as a
 * 0.7–1.8s main-thread block on every touch gesture on an empty or
 * whitespace-only screenplay — the thread genuinely blocked, with no long
 * callback in any application code — gone the moment a single word exists, and
 * gone when the chrome is made user-select: none.
 *
 * The chrome carries that rule now, which stops the caret being placed at all.
 * This is the safety net behind it, run when a drawer toggles: a stray selection
 * anywhere outside an editor, a contenteditable or a form field is dropped.
 * Those are the user's and are left alone.
 */
export const dropChromeSelection = (): void => {
    if (typeof document === "undefined") return;
    const selection = document.getSelection();
    const anchor = selection?.anchorNode;
    if (!selection || !anchor || selection.rangeCount === 0) return;

    const element = anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement;
    if (!element) return;
    if (element.closest(".ProseMirror, [contenteditable]:not([contenteditable='false']), input, textarea")) return;

    selection.removeAllRanges();
};
