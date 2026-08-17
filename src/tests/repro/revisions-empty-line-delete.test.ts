import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";

import { BASE_EXTENSIONS } from "@src/lib/screenplay/editor";
import { createNodeIdDedupExtension } from "@src/lib/screenplay/extensions/node-id-dedup-extension";
import { createRevisionsExtension } from "@src/lib/screenplay/extensions/revisions-extension";
import { RevisionBaseEntry, captureRevisionBaseline } from "@src/lib/screenplay/revisions";

/**
 * Adding a blank line in revision mode and taking it straight back out must
 * leave no trace — least of all on the line the cursor falls back onto, which
 * the user never touched.
 *
 * Two independent faults each produced that phantom asterisk, and both are
 * guarded here because either one alone reproduces it:
 *
 *  1. `goneIds` rebased each step's removed span onto the original document
 *     through `tr.mapping.slice(0, i).invert()`. A sliced Mapping honours its
 *     bounds when mapping but NOT when inverting (`invert` delegates to
 *     `appendMappingInverted`, which walks the whole array), so at i = 0 — a
 *     one-step Backspace — the "identity" ran the cut's own inverse. The span
 *     came out shifted past the cut, sweeping the untouched line beyond it into
 *     the removed set; that line was in the baseline, so the flush concluded a
 *     baseline line had been deleted and anchored the cut on a neighbour.
 *
 *  2. Enter copies a line's attributes onto both halves of the split, and the
 *     dedup pass re-identified the later of the two. Splitting at the START of a
 *     line — inserting a blank line above it — therefore left the id on the blank
 *     half and handed the text a new one, so the baseline read the line below as
 *     new and coloured all of it; deleting the blank line then looked like the
 *     removal of a baseline line, phantom anchor and all.
 *
 * The editor here mirrors the app's: the dedup extension is what decides which
 * half of a split keeps its identity, so leaving it out would hide fault 2 (and
 * mask fault 1 behind duplicate ids that cancel in the comparison).
 */

type RevState = {
    enabled: boolean;
    current: number;
    display: "all" | "hidden" | "current";
    /** Revision the baseline belongs to; null → no baseline, event-based path. */
    baseIndex: number | null;
};

function makeEditor(lines: string[]) {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const rev: RevState = { enabled: false, current: 0, display: "all", baseIndex: null };
    const base = new Map<string, RevisionBaseEntry>();

    const editor = new Editor({
        element: el,
        injectCSS: false,
        autofocus: false,
        content: {
            type: "doc",
            content: lines.map((text, i) => ({
                type: "action",
                attrs: { "data-id": `n${i}`, class: "action" },
                content: text ? [{ type: "text", text }] : [],
            })),
        },
        extensions: [
            ...BASE_EXTENSIONS,
            createNodeIdDedupExtension({ duplicatePersistentScene: () => {} }),
            createRevisionsExtension({
                getRevisionsEnabled: () => rev.enabled,
                getCurrentRevision: () => rev.current,
                getDisplayMode: () => rev.display,
                getBaseline: () =>
                    rev.baseIndex === null ? null : { index: rev.baseIndex, get: (id: string) => base.get(id) },
            }),
        ],
    });

    /** Snapshot the document as the baseline for `index`, as opening it would. */
    const capture = (index: number) => {
        base.clear();
        captureRevisionBaseline(editor.state.doc, index).forEach((v, k) => base.set(k, v));
        rev.baseIndex = index;
    };

    return { editor, rev, capture };
}

/** Stamping is debounced (FLUSH_DELAY = 220ms); wait past it before asserting. */
const settle = () => new Promise((r) => setTimeout(r, 320));

/** Document position just inside top-level child `index`. */
function insidePos(editor: Editor, index: number): number {
    let pos = -1;
    editor.state.doc.forEach((node, p, i) => {
        if (i === index) pos = p + 1;
    });
    return pos;
}

/** Does child `index` carry any revision signal at all (mark or node attribute)? */
const isMarked = (editor: Editor, index: number): boolean => {
    const node = editor.state.doc.child(index);
    if (node.attrs.revision != null) return true;
    let marked = false;
    node.descendants((child) => {
        if (child.isText && child.marks.some((m) => m.type.name === "revision")) marked = true;
        return !marked;
    });
    return marked;
};

/** Indices of every top-level line carrying a revision signal. */
const markedLines = (editor: Editor): number[] => {
    const out: number[] = [];
    editor.state.doc.forEach((_node, _pos, i) => {
        if (isMarked(editor, i)) out.push(i);
    });
    return out;
};

const textOf = (editor: Editor, index: number): string => editor.state.doc.child(index).textContent;

/** A real Backspace, through the keymap the user's key actually reaches. */
const backspaceAt = (editor: Editor, index: number) => {
    editor.chain().focus().setTextSelection(insidePos(editor, index)).run();
    editor.commands.keyboardShortcut("Backspace");
};

const enterAt = (editor: Editor, index: number, offset: number) => {
    editor
        .chain()
        .focus()
        .setTextSelection(insidePos(editor, index) + offset)
        .splitBlock()
        .run();
};

const LINES = ["FADE IN ON A HOUSE", "A man walks in", "He sits down", "SILENCE"];

describe("revisions: deleting a blank line added in this revision", () => {
    it("leaves the line the cursor lands on unmarked (Enter at the end of a line)", async () => {
        const { editor, rev, capture } = makeEditor(LINES);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        enterAt(editor, 1, LINES[1].length);
        await settle();
        expect(editor.state.doc.childCount).toBe(LINES.length + 1);
        // The blank line is this revision's; nothing else is.
        expect(markedLines(editor)).toEqual([2]);

        backspaceAt(editor, 2);
        await settle();

        expect(editor.state.doc.childCount).toBe(LINES.length);
        expect(textOf(editor, 1)).toBe(LINES[1]);
        // The cursor fell back onto line 1, which the user never edited.
        expect(markedLines(editor)).toEqual([]);
    });

    it("leaves the line the cursor lands on unmarked (Enter at the start of a line)", async () => {
        const { editor, rev, capture } = makeEditor(LINES);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        // A blank line inserted ABOVE line 2 — the split that hands the new node
        // the earlier position, so identity has to stay with the text below it.
        enterAt(editor, 2, 0);
        await settle();
        expect(editor.state.doc.childCount).toBe(LINES.length + 1);
        expect(textOf(editor, 3)).toBe(LINES[2]);
        // Only the blank line is new — the line it was inserted above is the same
        // line it always was, not a word of it changed.
        expect(markedLines(editor)).toEqual([2]);

        backspaceAt(editor, 2);
        await settle();

        expect(editor.state.doc.childCount).toBe(LINES.length);
        expect(textOf(editor, 1)).toBe(LINES[1]);
        expect(markedLines(editor)).toEqual([]);
    });

    it("still anchors the cut when the deleted blank line existed at the baseline", async () => {
        const { editor, rev, capture } = makeEditor(LINES);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        // Wipe line 2's words, then take the emptied line itself out. Unlike the
        // cases above this is a real cut of a line the last issued pages carried,
        // so its asterisk has to survive on a neighbour — the fix must not have
        // bought its silence by dropping genuine deletions.
        const start = insidePos(editor, 2);
        editor
            .chain()
            .focus()
            .deleteRange({ from: start, to: start + LINES[2].length })
            .run();
        await settle();
        backspaceAt(editor, 2);
        await settle();

        expect(editor.state.doc.childCount).toBe(LINES.length - 1);
        expect(markedLines(editor)).toEqual([1]);
    });
});
