import type { Editor } from "@tiptap/react";
import { Selection } from "@tiptap/pm/state";

/** Vertical distance from a point to a rect's band; 0 when the point is inside it. */
const verticalGap = (rect: DOMRect, top: number) => Math.max(rect.top - top, top - rect.bottom, 0);

const elementRect = (dom: Node | null): DOMRect | null =>
    dom instanceof HTMLElement ? dom.getBoundingClientRect() : null;

/**
 * Hit-test a client (viewport) point and return a position a caret can actually
 * sit in, or null when the point isn't over the document at all.
 *
 * `posAtCoords` does not only report in-text positions. Whenever the point falls
 * outside the box of the block the browser resolved it to — most often *above*
 * it, in the blank margin screenplay elements leave between lines, but also left
 * of it or past the end of a short line — ProseMirror deliberately throws the
 * browser's caret offset away and returns the boundary before/after that block
 * instead (`posFromCaret` in prosemirror-view). Such a position lives directly in
 * the doc rather than inside any node, and everything downstream then reads it as
 * nothing at all:
 *
 *   - the selection's parent is the doc, which carries no `class` attribute, so
 *     the active screenplay element reports as empty (see `onSelectionUpdate` in
 *     use-document-editor);
 *   - `domAtPos` answers with the editor container instead of a line, so the
 *     centring that follows scrolls to the middle of the whole script.
 *
 * That blank margin is exactly what a finger aimed at the *first character* of a
 * line tends to catch, and the pen button's fixed aim point (a quarter down the
 * viewport, see {@link focusEditorInViewport}) lands in one just as easily —
 * which is why this showed up as "focusing the start of a node is broken".
 *
 * Recovery keeps the line the user meant: of the two blocks flanking the
 * boundary, take whichever the point is vertically nearest, then hit-test again
 * with the point pulled just inside that block's box, so the caret still lands on
 * the column the finger was over rather than being dumped at offset 0. If even
 * that yields no text position, settle for the block's near edge — its start when
 * we came from before it, its end when from after.
 */
const caretPosAtCoords = (editor: Editor, left: number, top: number): number | null => {
    const { view } = editor;
    const hit = view.posAtCoords({ left, top });
    if (!hit) return null;

    const { doc } = editor.state;
    const clamp = (pos: number) => Math.max(0, Math.min(doc.content.size, pos));
    const $hit = doc.resolve(clamp(hit.pos));
    if ($hit.parent.isTextblock) return $hit.pos;

    // A boundary between two blocks (at any depth — the same override fires for
    // an ancestor such as a dual-dialogue container).
    const before = $hit.nodeBefore;
    const after = $hit.nodeAfter;
    const beforeRect = elementRect(before && view.nodeDOM($hit.pos - before.nodeSize));
    const afterRect = elementRect(after && view.nodeDOM($hit.pos));

    let forward: boolean;
    if (beforeRect && afterRect) forward = verticalGap(afterRect, top) <= verticalGap(beforeRect, top);
    else if (beforeRect) forward = false;
    else forward = true;

    // Pull the point just inside the chosen block and ask again: with nothing
    // outside its box left to veto, posAtCoords keeps the browser's caret offset,
    // so the caret lands on the column the finger was actually over.
    const rect = forward ? afterRect : beforeRect;
    if (rect && rect.width > 0 && rect.height > 0) {
        const retry = view.posAtCoords({
            left: Math.min(Math.max(left, rect.left + 1), rect.right - 1),
            top: Math.min(Math.max(top, rect.top + 1), rect.bottom - 1),
        });
        if (retry) {
            const $retry = doc.resolve(clamp(retry.pos));
            if ($retry.parent.isTextblock) return $retry.pos;
        }
    }

    // Nothing hit-testable there (an unrendered or zero-sized neighbour): walk to
    // the nearest caret position in the chosen direction. `textOnly` makes it
    // descend into container nodes rather than stopping on one, so the result is
    // always inside a textblock.
    const dir = forward ? 1 : -1;
    const near = Selection.findFrom($hit, dir, true) ?? Selection.findFrom($hit, -dir, true);
    return near ? near.head : null;
};

/**
 * The DOM element of the block the caret sits in — the thing worth scrolling to.
 *
 * Read from the caret's *block* rather than from the raw head position: a head
 * that isn't inside a textblock makes `domAtPos` answer with the editor
 * container, and centring that scrolls to the middle of the entire script.
 * {@link caretPosAtCoords} keeps such positions out of the selection, but a caret
 * restored from elsewhere could still sit on one, so the container is rejected
 * outright rather than scrolled to.
 */
const caretBlockElement = (editor: Editor): HTMLElement | null => {
    const { $head } = editor.state.selection;
    if ($head.depth > 0) {
        const dom = editor.view.nodeDOM($head.before($head.depth));
        if (dom instanceof HTMLElement) return dom;
    }
    const { node } = editor.view.domAtPos($head.pos);
    const element = node instanceof HTMLElement ? node : node.parentElement;
    return element && element !== editor.view.dom ? element : null;
};

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
    // Always a position inside a textblock — see caretPosAtCoords for why the raw
    // hit test isn't good enough. It's already visible, so the focus's
    // scroll-into-view is a no-op and nothing jumps.
    const pos = caretPosAtCoords(editor, left, top);
    if (pos !== null) {
        editor.commands.focus(pos);
    } else {
        // Nothing under the point (e.g. an empty/short document, or a tap below
        // the end of the script) — fall back to the default focus so the keyboard
        // still comes up.
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
        const element = caretBlockElement(editor);
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
