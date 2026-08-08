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

/**
 * Smallest bottom coverage that is a real on-screen keyboard rather than the
 * region iOS reserves around its shortcuts bar.
 *
 * Measured on an iPad Pro 12.9" (1024×1366, portrait) with a hardware keyboard
 * attached: the software keyboard covers 403px, and dismissing it with the
 * keyboard's own hide key still leaves **173px** reserved — nearly all of it
 * empty, the bar actually drawn there being a fraction of the height. Anything
 * placed against that residue floats a hand's width off the screen edge.
 *
 * Distinct from KEYBOARD_THRESHOLD, and far above it: that one exists to stop
 * a few px of chrome jitter reading as a keyboard, so it sits at 120 — under the
 * 173 seen here, which is why the residue used to pass for a keyboard.
 */
export const KEYBOARD_MIN_HEIGHT = 280;

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
 * How much of the layout viewport is covered at the bottom right now — an
 * on-screen keyboard, iOS's hardware-keyboard shortcuts bar, browser chrome,
 * whatever it happens to be — with no threshold applied.
 *
 * The unfloored counterpart to keyboardInsetNow, and used where the question is
 * *where does the usable area end* rather than *is a keyboard up*. The latter has
 * a yes/no answer, so flooring small values keeps viewport jitter from reading as
 * a keyboard. The former has no such cliff: a bar that covers 50px covers 50px,
 * and anything positioning against it has to follow it continuously — put a
 * threshold in that path and the thing jumps the moment a bar animating in
 * crosses it, which is exactly what a floored reading did to the format bar.
 */
export const viewportBottomInset = (): number => {
    if (typeof window === "undefined" || !window.visualViewport) return 0;
    const vv = window.visualViewport;
    return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
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
