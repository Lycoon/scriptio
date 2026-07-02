import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";

import { BASE_EXTENSIONS } from "@src/lib/screenplay/editor";
import { createRevisionsExtension } from "@src/lib/screenplay/extensions/revisions-extension";

type RevState = { enabled: boolean; current: number; display: "all" | "hidden" | "current" };

function makeEditor(n: number) {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const rev: RevState = { enabled: false, current: 0, display: "all" };

    const content: object[] = [];
    for (let i = 0; i < n; i++) {
        content.push({
            type: "action",
            attrs: { "data-id": `n${i}`, class: "action" },
            content: [{ type: "text", text: `L${i}` }],
        });
    }

    const editor = new Editor({
        element: el,
        injectCSS: false,
        autofocus: false,
        content: { type: "doc", content },
        extensions: [
            ...BASE_EXTENSIONS,
            createRevisionsExtension({
                getRevisionsEnabled: () => rev.enabled,
                getCurrentRevision: () => rev.current,
                getDisplayMode: () => rev.display,
            }),
        ],
    });
    return { editor, rev };
}

/** Revision stamping is debounced (FLUSH_DELAY = 220ms); wait past it so the
 *  marks/attributes have been written before asserting. */
const settle = () => new Promise((r) => setTimeout(r, 320));

/** Document position just inside top-level child `index`. */
function insidePos(editor: Editor, index: number): number {
    let pos = -1;
    editor.state.doc.forEach((node, p, i) => {
        if (i === index) pos = p + 1;
    });
    return pos;
}

/** The first revision mark ({ index, kind }) on any text in child `index`, or null. */
const revMarkOf = (editor: Editor, index: number): { index: number; kind: string } | null => {
    const node = editor.state.doc.child(index);
    let found: { index: number; kind: string } | null = null;
    node.descendants((child) => {
        if (found || !child.isText) return;
        const mark = child.marks.find((m) => m.type.name === "revision");
        if (mark) found = { index: mark.attrs.index as number, kind: mark.attrs.kind as string };
    });
    return found;
};

/** Highest revision-mark index on any text in child `index`, or null. */
const maxRevOf = (editor: Editor, index: number): number | null => {
    const node = editor.state.doc.child(index);
    let max: number | null = null;
    node.descendants((child) => {
        if (!child.isText) return;
        const mark = child.marks.find((m) => m.type.name === "revision");
        if (mark) {
            const i = mark.attrs.index as number;
            if (max === null || i > max) max = i;
        }
    });
    return max;
};

/** Node-level revision attribute on top-level child `index`, or null. */
const lineAttrOf = (editor: Editor, index: number): number | null =>
    (editor.state.doc.child(index).attrs.revision as number | null) ?? null;

function editLine(editor: Editor, index: number, text: string) {
    editor.chain().focus().insertContentAt(insidePos(editor, index), text).run();
}

describe("revisions: changes are stamped (debounced), cumulatively", () => {
    it("does not mark while disabled", async () => {
        const { editor, rev } = makeEditor(6);
        rev.enabled = false;
        rev.current = 1;
        editLine(editor, 2, "x");
        await settle();
        expect(maxRevOf(editor, 2)).toBeNull();
    });

    it("does not mark on the White base revision (index 0)", async () => {
        const { editor, rev } = makeEditor(6);
        rev.enabled = true;
        rev.current = 0;
        editLine(editor, 2, "x");
        await settle();
        expect(maxRevOf(editor, 2)).toBeNull();
    });

    it("marks only the edited line with the current revision (coloured insert)", async () => {
        const { editor, rev } = makeEditor(6);
        rev.enabled = true;
        rev.current = 1;
        editLine(editor, 2, "x");
        await settle();
        expect(revMarkOf(editor, 2)).toEqual({ index: 1, kind: "ins" });
        expect(maxRevOf(editor, 0)).toBeNull();
        expect(maxRevOf(editor, 3)).toBeNull();
    });

    it("keeps earlier revisions when advancing and editing another line", async () => {
        const { editor, rev } = makeEditor(6);
        rev.enabled = true;
        rev.current = 1;
        editLine(editor, 2, "x"); // Blue
        await settle();

        rev.current = 2;
        editLine(editor, 4, "y"); // Pink
        await settle();

        expect(maxRevOf(editor, 2)).toBe(1); // blue mark preserved (cumulative)
        expect(maxRevOf(editor, 4)).toBe(2); // pink mark on the newly edited line
    });

    it("re-marks newly edited text to the current revision", async () => {
        const { editor, rev } = makeEditor(6);
        rev.enabled = true;
        rev.current = 1;
        editLine(editor, 2, "x"); // Blue
        await settle();
        expect(maxRevOf(editor, 2)).toBe(1);

        rev.current = 2;
        editLine(editor, 2, "z"); // edited again under Pink
        await settle();
        expect(maxRevOf(editor, 2)).toBe(2); // latest revision present on the line
    });

    it("counts a deletion via an invisible (uncoloured) anchor mark", async () => {
        const { editor, rev } = makeEditor(6);
        rev.enabled = true;
        rev.current = 1;
        // Delete one character from line 2 ("L2" → "2").
        const at = insidePos(editor, 2);
        editor.chain().focus().deleteRange({ from: at, to: at + 1 }).run();
        await settle();
        // The surviving char anchors the change but is NOT coloured (kind "del").
        expect(revMarkOf(editor, 2)).toEqual({ index: 1, kind: "del" });
    });

    it("keeps the surviving char's colour when deleting at the end of a marked run", async () => {
        const { editor, rev } = makeEditor(6);
        rev.enabled = true;
        rev.current = 1;

        // Append coloured text to the END of line 2 → "L2XY" (XY = ins mark).
        let start = 0;
        editor.state.doc.forEach((n, p, i) => {
            if (i === 2) start = p;
        });
        const endInside = start + editor.state.doc.child(2).nodeSize - 1;
        editor.chain().focus().insertContentAt(endInside, "XY").run();
        await settle();
        expect(revMarkOf(editor, 2)).toEqual({ index: 1, kind: "ins" });

        // Delete the trailing char. The deletion anchor used to stamp a "del"
        // mark on the surviving "X" — and since the `revision` mark excludes its
        // own type, that stripped X's "ins" colour. It must stay coloured now.
        editor.state.doc.forEach((n, p, i) => {
            if (i === 2) start = p;
        });
        const lastInside = start + editor.state.doc.child(2).nodeSize - 1;
        editor.chain().focus().deleteRange({ from: lastInside - 1, to: lastInside }).run();
        await settle();

        expect(revMarkOf(editor, 2)).toEqual({ index: 1, kind: "ins" });
        expect(maxRevOf(editor, 2)).toBe(1);
    });

    it("keeps colour when a char is typed then a later char deleted in the same flush", async () => {
        const { editor, rev } = makeEditor(6);
        rev.enabled = true;
        rev.current = 1;

        // Append "XY" to the end of line 2, then delete the trailing "Y" — all
        // WITHOUT settling, so both land in one debounce window. The flush then
        // stamps the "ins" mark on "X" and a "del" anchor for the deletion in
        // the same transaction; the del anchor must not clobber X's fresh ins.
        let start = 0;
        editor.state.doc.forEach((n, p, i) => {
            if (i === 2) start = p;
        });
        const endInside = start + editor.state.doc.child(2).nodeSize - 1;
        editor.chain().focus().insertContentAt(endInside, "XY").run();

        editor.state.doc.forEach((n, p, i) => {
            if (i === 2) start = p;
        });
        const lastInside = start + editor.state.doc.child(2).nodeSize - 1;
        editor.chain().focus().deleteRange({ from: lastInside - 1, to: lastInside }).run();
        await settle();

        expect(revMarkOf(editor, 2)).toEqual({ index: 1, kind: "ins" });
        expect(maxRevOf(editor, 2)).toBe(1);
    });

    it("counts a new empty line (Enter) via the node attribute", async () => {
        const { editor, rev } = makeEditor(6);
        rev.enabled = true;
        rev.current = 1;
        // Enter at the end of line 2 → a new empty line 3.
        let start = 0;
        editor.state.doc.forEach((n, p, i) => {
            if (i === 2) start = p;
        });
        const node = editor.state.doc.child(2);
        const endOfNode = start + node.nodeSize - 1;
        editor.chain().focus().setTextSelection(endOfNode).splitBlock().run();
        await settle();
        // The freshly created empty line is flagged via the node attribute.
        expect(lineAttrOf(editor, 3)).toBe(1);
        expect(editor.state.doc.child(3).content.size).toBe(0);
    });
});
