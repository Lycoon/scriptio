import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";

import { BASE_EXTENSIONS } from "@src/lib/screenplay/editor";
import { focusEditorAtCoords } from "@src/lib/editor/focus-in-viewport";

/**
 * Entering edit mode on phone drops the caret at a tapped point instead of at the
 * stored selection. The point often falls in the blank margin a screenplay leaves
 * above a line — a finger aimed at that line's first character catches it easily,
 * and the pen button's fixed aim point (a quarter down the viewport) lands there
 * too. ProseMirror answers such a point with the *boundary* before the block
 * rather than a position inside it, and a caret parked on a boundary reports no
 * screenplay element and resolves to the editor container instead of a line.
 *
 * Needs real layout (rects, line boxes, margin collapsing), so it runs in
 * Chromium and WebKit — see vitest.config.ts.
 */

const LINE = 20;
/** Blank band above a line: what a tap aimed at its first character can catch. */
const GAP = 16;
/** Indent of a dialogue block — padding, so the box still spans the full width. */
const INDENT = 120;

const teardown: Array<() => void> = [];
afterEach(() => {
    while (teardown.length) teardown.pop()!();
});

const mount = () => {
    const style = document.createElement("style");
    style.textContent = `
        .fv-host { width: 480px; height: 360px; overflow-y: auto; position: relative; }
        .fv-host .ProseMirror { font: 14px monospace; line-height: ${LINE}px; outline: none; }
        .fv-host .ProseMirror > * { margin: ${GAP}px 0 0 0; padding: 0; }
        .fv-host .ProseMirror .dialogue { padding-left: ${INDENT}px; padding-right: ${INDENT}px; }
        .fv-host .ProseMirror .character { padding-left: ${INDENT}px; }
    `;
    document.head.appendChild(style);

    const host = document.createElement("div");
    host.className = "fv-host";
    document.body.appendChild(host);

    const line = (type: string, text: string, id: string) => ({
        type,
        attrs: { class: type, "data-id": id },
        content: [{ type: "text", text }],
    });

    const editor = new Editor({
        element: host,
        extensions: BASE_EXTENSIONS,
        injectCSS: false,
        autofocus: false,
        content: {
            type: "doc",
            content: [
                line("action", "The room is empty, save for a single chair.", "n0"),
                line("character", "MARLOWE", "n1"),
                line("dialogue", "I have been here before, and I will be here again.", "n2"),
                line("action", "He sits.", "n3"),
            ],
        },
    });

    teardown.push(() => {
        editor.destroy();
        host.remove();
        style.remove();
    });

    return editor;
};

/** Position of the first character of the nth top-level block. */
const startOfBlock = (editor: Editor, index: number) => {
    let pos = -1;
    let i = 0;
    editor.state.doc.forEach((_node, offset) => {
        if (i++ === index) pos = offset + 1;
    });
    return pos;
};

/** What the app reads off the caret: the element class, and where in the node it is. */
const caret = (editor: Editor) => {
    const { $head } = editor.state.selection;
    return {
        isTextblock: $head.parent.isTextblock,
        element: $head.parent.attrs.class as string | undefined,
        offset: $head.parentOffset,
        textLength: $head.parent.content.size,
    };
};

describe("focusEditorAtCoords", () => {
    it("lands on the first character when the tap catches the margin above a line", () => {
        const editor = mount();
        const start = startOfBlock(editor, 2); // the dialogue
        const box = editor.view.coordsAtPos(start);

        // A few px above the line's top edge and at its left edge — inside the
        // block's blank leading margin, which is where a finger aimed at the first
        // character actually lands.
        focusEditorAtCoords(editor, box.left, box.top - GAP / 2);

        expect(caret(editor)).toMatchObject({ isTextblock: true, element: "dialogue", offset: 0 });
    });

    it("lands inside the line when the tap falls left of its indented text", () => {
        const editor = mount();
        const start = startOfBlock(editor, 2);
        const box = editor.view.coordsAtPos(start);

        // Left of the dialogue's indent, vertically on the line itself.
        focusEditorAtCoords(editor, box.left - INDENT / 2, (box.top + box.bottom) / 2);

        expect(caret(editor)).toMatchObject({ isTextblock: true, element: "dialogue", offset: 0 });
    });

    it("keeps the tapped line when the tap falls past the end of a short one", () => {
        const editor = mount();
        const start = startOfBlock(editor, 1); // the character cue
        const end = start + editor.state.doc.nodeAt(start - 1)!.content.size;
        const box = editor.view.coordsAtPos(end);

        // Well right of "MARLOWE", still on its line: the caret belongs at the end
        // of that cue, not at the start of the dialogue underneath.
        focusEditorAtCoords(editor, box.right + 200, (box.top + box.bottom) / 2);

        const c = caret(editor);
        expect(c).toMatchObject({ isTextblock: true, element: "character" });
        expect(c.offset).toBe(c.textLength);
    });

    it("keeps the tapped column, not just the start of the node", () => {
        const editor = mount();
        const start = startOfBlock(editor, 2);
        const box = editor.view.coordsAtPos(start);
        const tenth = editor.view.coordsAtPos(start + 10);

        // Above the line again, but horizontally over its 10th character.
        focusEditorAtCoords(editor, tenth.left, box.top - GAP / 2);

        const c = caret(editor);
        expect(c).toMatchObject({ isTextblock: true, element: "dialogue" });
        expect(c.offset).toBeGreaterThan(0);
    });

    it("resolves the caret's block, not the editor container, for the follow-up scroll", () => {
        const editor = mount();
        const start = startOfBlock(editor, 2);
        const box = editor.view.coordsAtPos(start);

        focusEditorAtCoords(editor, box.left, box.top - GAP / 2);

        // centerCaretInView scrolls whatever domAtPos reports here; on a boundary
        // position that used to be the whole editor, which centres the script.
        const { node } = editor.view.domAtPos(editor.state.selection.head);
        const element = node instanceof HTMLElement ? node : node.parentElement;
        expect(element).not.toBe(editor.view.dom);
        expect(element?.closest(".dialogue")).not.toBeNull();
    });
});
