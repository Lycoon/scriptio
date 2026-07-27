/**
 * How much of the layout viewport the on-screen keyboard — and the phone format
 * toolbar riding on top of it — currently cover at the bottom.
 *
 * The app shell is pinned to the layout viewport (100vh, and ProjectWorkspace
 * locks window scroll to 0), so the keyboard shrinks nothing: it simply sits over
 * the bottom of the editor. Everything that has to keep content clear of it —
 * the reserved scroll room and caret follow in useKeyboardCaretVisibility, the
 * centring in centerCaretInView, the toolbar's own offset — measures from here so
 * they all agree on where "visible" ends.
 */

// Below this the visualViewport shrink is just browser chrome jitter, not an
// open on-screen keyboard.
export const KEYBOARD_THRESHOLD = 120;

/** Height (px) the on-screen keyboard hides at the bottom. 0 when it's down. */
export const keyboardInsetNow = (): number => {
    if (typeof window === "undefined" || !window.visualViewport) return 0;
    const vv = window.visualViewport;
    // Layout-viewport height minus the visible visual viewport (and any offset
    // from a scrolled visual viewport) is what the keyboard hides.
    const covered = window.innerHeight - vv.height - vv.offsetTop;
    return covered > KEYBOARD_THRESHOLD ? covered : 0;
};

/**
 * The keyboard inset plus the MobileFormatToolbar floating above it (found by its
 * `role="toolbar"`) — i.e. everything between the top of that chrome and the
 * bottom of the layout viewport. 0 when no keyboard is up.
 *
 * `Math.max` rather than the toolbar alone: the bar is only mounted while an
 * editor holds the keyboard, and it mounts a beat after the keyboard starts
 * rising, so the raw inset is the floor until it appears.
 */
export const coveredBottomBand = (): number => {
    const keyboard = keyboardInsetNow();
    if (keyboard <= 0) return 0;
    const toolbar = document.querySelector<HTMLElement>('[role="toolbar"]');
    if (!toolbar) return keyboard;
    return Math.max(keyboard, window.innerHeight - toolbar.getBoundingClientRect().top);
};
