import { afterEach, describe, expect, it } from "vitest";

import { dropChromeSelection } from "@src/lib/utils/selection";

/** Put a caret at the start of `el`'s contents, the way a tap's mouse-down would. */
const placeCaretIn = (el: HTMLElement) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
};

afterEach(() => {
    document.getSelection()?.removeAllRanges();
    document.querySelectorAll("[data-chrome-selection-fixture]").forEach((node) => node.remove());
});

const fixture = (tag: string, className = ""): HTMLElement => {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = "x";
    el.setAttribute("data-chrome-selection-fixture", "");
    document.body.appendChild(el);
    return el;
};

describe("dropChromeSelection", () => {
    it("drops a caret parked in plain chrome", () => {
        const chrome = fixture("div", "sidebar_backdrop");
        placeCaretIn(chrome);
        expect(document.getSelection()!.rangeCount).toBe(1);

        dropChromeSelection();
        expect(document.getSelection()!.rangeCount).toBe(0);
    });

    it("leaves a selection inside an editor alone", () => {
        const editor = fixture("div", "ProseMirror");
        editor.contentEditable = "true";
        placeCaretIn(editor);

        dropChromeSelection();
        const selection = document.getSelection()!;
        expect(selection.rangeCount).toBe(1);
        expect(editor.contains(selection.anchorNode)).toBe(true);
    });

    it("leaves a selection inside any contenteditable alone, editor or not", () => {
        const field = fixture("div");
        field.contentEditable = "true";
        placeCaretIn(field);

        dropChromeSelection();
        expect(document.getSelection()!.rangeCount).toBe(1);
    });

    it("is a no-op when nothing is selected", () => {
        document.getSelection()!.removeAllRanges();
        expect(() => dropChromeSelection()).not.toThrow();
        expect(document.getSelection()!.rangeCount).toBe(0);
    });
});
