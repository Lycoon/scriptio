import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";

import { BASE_EXTENSIONS } from "@src/lib/screenplay/editor";
import { createRevisionsExtension } from "@src/lib/screenplay/extensions/revisions-extension";
import { RevisionBaseEntry, captureRevisionBaseline, diffRuns } from "@src/lib/screenplay/revisions";

/**
 * Revision marks derived by comparing each line against the baseline captured
 * when the revision opened, rather than by replaying the edits that reached it.
 *
 * The behaviour these lock down is the difference between "this line was touched"
 * and "this line differs from the draft that went out" — the second being what a
 * production asterisk actually means.
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

    return { editor, rev, base, capture };
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

/** Does child `index` carry any revision signal at all (mark or node attribute)? */
const isMarked = (editor: Editor, index: number): boolean =>
    maxRevOf(editor, index) !== null || lineAttrOf(editor, index) !== null;

/** The text actually carrying a revision mark in child `index`. */
const markedTextOf = (editor: Editor, index: number): string => {
    const node = editor.state.doc.child(index);
    let out = "";
    node.descendants((child) => {
        if (!child.isText) return;
        if (child.marks.some((m) => m.type.name === "revision" && m.attrs.kind === "ins")) out += child.text ?? "";
    });
    return out;
};

/** Line-local offset where child `index`'s first "ins" mark starts, or -1. */
const markStartOf = (editor: Editor, index: number): number => {
    let start = -1;
    editor.state.doc.child(index).descendants((child, off) => {
        if (!child.isText || start >= 0) return;
        if (child.marks.some((m) => m.type.name === "revision" && m.attrs.kind === "ins")) start = off;
    });
    return start;
};

const textOf = (editor: Editor, index: number): string => editor.state.doc.child(index).textContent;

const deleteIn = (editor: Editor, index: number, from: number, to: number) => {
    const start = insidePos(editor, index);
    editor.chain().focus().deleteRange({ from: start + from, to: start + to }).run();
};

const insertIn = (editor: Editor, index: number, at: number, text: string) => {
    const start = insidePos(editor, index);
    editor.chain().focus().insertContentAt(start + at, text).run();
};

const LINES = ["FADE IN ON A HOUSE", "A man walks in", "He sits down", "SILENCE"];

describe("diffRuns", () => {
    it("returns nothing for identical text", () => {
        expect(diffRuns("abc", "abc")).toEqual([]);
    });

    it("isolates a replaced character", () => {
        expect(diffRuns("abc", "aXc")).toEqual([{ from: 1, to: 2 }]);
    });

    it("isolates an insertion in the middle", () => {
        expect(diffRuns("abc", "abXc")).toEqual([{ from: 2, to: 3 }]);
    });

    it("collapses on a pure deletion", () => {
        expect(diffRuns("abc", "ac")).toEqual([{ from: 1, to: 1 }]);
    });

    it("handles insertion into empty text and deletion to empty", () => {
        expect(diffRuns("", "abc")).toEqual([{ from: 0, to: 3 }]);
        expect(diffRuns("abc", "")).toEqual([{ from: 0, to: 0 }]);
    });

    it("reports two separated edits as two runs, not one spanning region", () => {
        // The regression: a prefix/suffix trim can only name one region, so it
        // reported [0, 27) here — colouring the untouched middle.
        expect(diffRuns("The quick brown fox jumps", "XThe quick brown fox jumpsY")).toEqual([
            { from: 0, to: 1 },
            { from: 26, to: 27 },
        ]);
    });

    it("reports an edit at each end of a sentence without touching the middle", () => {
        const runs = diffRuns("He sits down slowly and waits", "She sits down slowly and waited");
        expect(runs.length).toBe(2);
        expect(runs[0].from).toBe(0);
        // Nothing marked across the untouched middle.
        expect(runs[0].to).toBeLessThanOrEqual(3);
        expect(runs[1].from).toBeGreaterThan(20);
    });

    it("reports a separated insertion and deletion", () => {
        expect(diffRuns("abcdefgh", "aXcdefh")).toEqual([
            { from: 1, to: 2 },
            { from: 6, to: 6 },
        ]);
    });

    it("marks the copy the caret actually inserted, not an identical neighbour", () => {
        // "Hey, it's you" + "it's " typed at offset 5. A prefix trim lands on the
        // SECOND "it's"; the known-added span puts it back on the one typed.
        const prev = "Hey, it's you";
        const next = "Hey, it's it's you";
        expect(diffRuns(prev, next, [{ from: 5, to: 10 }])).toEqual([{ from: 5, to: 10 }]);
        // Typed AFTER the existing one instead — same text, different intent.
        expect(diffRuns(prev, next, [{ from: 10, to: 15 }])).toEqual([{ from: 10, to: 15 }]);
    });

    it("covers a known-added span narrower than the run it belongs to", () => {
        // The word was typed in bursts, so only its tail is still accounted for.
        // Pinning the run's start to that tail shunts it right by the "emb" typed
        // earlier, colouring "arrassemb" — the run has to COVER the span, not
        // start at it.
        const prev = "Sorry to embarrass you.";
        const next = "Sorry to embarrassembarrass you.";
        expect(diffRuns(prev, next, [{ from: 12, to: 18 }])).toEqual([{ from: 9, to: 18 }]);
        // ...and the same tail belonging to the second copy pins it there instead.
        expect(diffRuns(prev, next, [{ from: 21, to: 27 }])).toEqual([{ from: 18, to: 27 }]);
    });

    it("keeps an inserted run on its word boundary", () => {
        // The trim reports "tands and s", orphaning the "s" of "stands" and
        // claiming the "s" of "sits".
        const prev = "He sits";
        const next = "He stands and sits";
        expect(diffRuns(prev, next, [{ from: 3, to: 14 }])).toEqual([{ from: 3, to: 14 }]);
        expect(next.slice(3, 14)).toBe("stands and ");
        // Two bursts, "very " typed in front of an earlier "stands and ". Knowing
        // only the second burst, the run covers it but keeps a character of slack —
        // which of the two spaces is the new one is genuinely undecidable here...
        const two = "He very stands and sits";
        expect(diffRuns(prev, two, [{ from: 3, to: 8 }])).toEqual([{ from: 2, to: 18 }]);
        // ...and the first burst's own marked span settles it: exactly what was typed.
        expect(
            diffRuns(prev, two, [
                { from: 3, to: 8 },
                { from: 8, to: 19 },
            ]),
        ).toEqual([{ from: 3, to: 19 }]);
        expect(two.slice(3, 19)).toBe("very stands and ");
    });

    it("with nothing known added, prefers the leftmost equivalent alignment", () => {
        expect(diffRuns("He sits", "He stands and sits")).toEqual([{ from: 2, to: 13 }]);
    });

    it("ignores a known-added span belonging to another run", () => {
        // Two edits, and only the second one's span is known — it must not drag the
        // first run away from where the diff put it.
        expect(diffRuns("aXbYc", "aQbRc", [{ from: 3, to: 4 }])).toEqual([
            { from: 1, to: 2 },
            { from: 3, to: 4 },
        ]);
    });

    it("does not slide a run that replaced text rather than only adding", () => {
        // "cat" → "dog" is pinned by what it replaced; nothing to disambiguate.
        expect(diffRuns("the cat sat", "the dog sat", [{ from: 4, to: 7 }])).toEqual([{ from: 4, to: 7 }]);
    });

    it("falls back to one coarse run when the changed region is a rewrite", () => {
        const prev = "q".repeat(600);
        const next = "z".repeat(600);
        expect(diffRuns(prev, next)).toEqual([{ from: 0, to: 600 }]);
    });
});

describe("revisions: marks are derived from the revision's baseline", () => {
    it("does not mark a character deleted and retyped in one flush window", async () => {
        const { editor, rev, capture } = makeEditor(LINES);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        deleteIn(editor, 1, 2, 3);
        insertIn(editor, 1, 2, "m");
        await settle();

        expect(textOf(editor, 1)).toBe("A man walks in");
        expect(isMarked(editor, 1)).toBe(false);
    });

    it("clears a committed mark when the text is restored in a later flush", async () => {
        const { editor, rev, capture } = makeEditor(LINES);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        deleteIn(editor, 1, 2, 3);
        await settle();
        // The deletion really was a change while it stood.
        expect(isMarked(editor, 1)).toBe(true);

        insertIn(editor, 1, 2, "m");
        await settle();

        expect(textOf(editor, 1)).toBe("A man walks in");
        expect(isMarked(editor, 1)).toBe(false);
    });

    it("does not mark a character typed and then deleted", async () => {
        const { editor, rev, capture } = makeEditor(LINES);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        insertIn(editor, 2, 3, "Z");
        await settle();
        expect(isMarked(editor, 2)).toBe(true);

        deleteIn(editor, 2, 3, 4);
        await settle();

        expect(textOf(editor, 2)).toBe("He sits down");
        expect(isMarked(editor, 2)).toBe(false);
    });

    it("marks only the run that actually differs from the baseline", async () => {
        const { editor, rev, capture } = makeEditor(LINES);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        insertIn(editor, 2, 3, "really ");
        await settle();

        expect(textOf(editor, 2)).toBe("He really sits down");
        expect(markedTextOf(editor, 2)).toBe("really ");
    });

    it("marks both ends of a paragraph without colouring the middle", async () => {
        const PARA = "He crosses the room and opens the heavy oak door onto the garden";
        const { editor, rev, capture } = makeEditor([LINES[0], PARA]);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        // Edit at the END of the paragraph, then at its START — the sequence that
        // used to mark everything in between.
        insertIn(editor, 1, PARA.length, " beyond");
        await settle();
        expect(markedTextOf(editor, 1)).toBe(" beyond");

        insertIn(editor, 1, 0, "Slowly ");
        await settle();

        expect(textOf(editor, 1)).toBe(`Slowly ${PARA} beyond`);
        // Only the two edits are coloured; the untouched middle stays clean.
        expect(markedTextOf(editor, 1)).toBe("Slowly  beyond");
    });

    it("colours the duplicate word the caret typed, not the one already there", async () => {
        const { editor, rev, capture } = makeEditor([LINES[0], "Hey, it's you"]);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        // Type "it's " immediately BEFORE the existing "it's".
        insertIn(editor, 1, 5, "it's ");
        await settle();

        expect(textOf(editor, 1)).toBe("Hey, it's it's you");
        expect(markedTextOf(editor, 1)).toBe("it's ");
        // The marked run has to be the FIRST occurrence — offset 5, not 10.
        const marked = editor.state.doc.child(1);
        let markStart = -1;
        marked.descendants((child, off) => {
            if (!child.isText) return;
            if (markStart < 0 && child.marks.some((m) => m.type.name === "revision" && m.attrs.kind === "ins")) {
                markStart = off;
            }
        });
        expect(markStart).toBe(5);
    });

    it("colours the typed copy when the duplicate word spans two flush windows", async () => {
        const { editor, rev, capture } = makeEditor([LINES[0], "Sorry to embarrass you."]);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        // A pause mid-word splits the typing across two flushes, so the second one
        // sees a run (the whole word) far wider than the keystrokes still sitting
        // in `pending` — and every alignment of it rebuilds the same sentence.
        insertIn(editor, 1, 9, "emb");
        await settle();
        expect(markedTextOf(editor, 1)).toBe("emb");

        insertIn(editor, 1, 12, "arrass");
        await settle();

        expect(textOf(editor, 1)).toBe("Sorry to embarrassembarrass you.");
        // The word the caret typed, whole — not "arrassemb", which leaves the "emb"
        // it started with reading as original text.
        expect(markedTextOf(editor, 1)).toBe("embarrass");
        expect(markStartOf(editor, 1)).toBe(9);
    });

    it("colours the typed copy when the duplicate word is typed AFTER the original", async () => {
        const { editor, rev, capture } = makeEditor([LINES[0], "Sorry to embarrass you."]);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        // Same final sentence, opposite intent: the second copy is the new one.
        insertIn(editor, 1, 18, "emb");
        await settle();
        insertIn(editor, 1, 21, "arrass");
        await settle();

        expect(textOf(editor, 1)).toBe("Sorry to embarrassembarrass you.");
        expect(markedTextOf(editor, 1)).toBe("embarrass");
        expect(markStartOf(editor, 1)).toBe(18);
    });

    it("keeps a phrase typed in front of an earlier one on its word boundary", async () => {
        const { editor, rev, capture } = makeEditor([LINES[0], "He sits"]);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        // "stands and " first, then "very " typed in front of it in a later flush:
        // the accumulated run reaches one character further left than the words
        // that were actually typed.
        insertIn(editor, 1, 3, "stands and ");
        await settle();
        insertIn(editor, 1, 3, "very ");
        await settle();

        expect(textOf(editor, 1)).toBe("He very stands and sits");
        expect(markedTextOf(editor, 1)).toBe("very stands and ");
        expect(markStartOf(editor, 1)).toBe(3);
    });

    it("keeps a typed phrase on its word boundary", async () => {
        const { editor, rev, capture } = makeEditor([LINES[0], "He sits"]);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        insertIn(editor, 1, 3, "stands and ");
        await settle();

        expect(textOf(editor, 1)).toBe("He stands and sits");
        // Not "tands and s", which is what the raw trim reports.
        expect(markedTextOf(editor, 1)).toBe("stands and ");
    });

    it("narrows an earlier coarse mark once a later edit makes the runs exact", async () => {
        const PARA = "She waits by the window until the car pulls away";
        const { editor, rev, capture } = makeEditor([LINES[0], PARA]);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        insertIn(editor, 1, 0, "A");
        insertIn(editor, 1, PARA.length + 1, "B");
        await settle();
        expect(markedTextOf(editor, 1)).toBe("AB");

        // Undo the first edit only: the second must keep its mark, and nothing
        // between them may hold colour left over from the earlier flush.
        deleteIn(editor, 1, 0, 1);
        await settle();

        expect(textOf(editor, 1)).toBe(`${PARA}B`);
        expect(markedTextOf(editor, 1)).toBe("B");
    });

    it("leaves other lines alone when one line is restored", async () => {
        const { editor, rev, capture } = makeEditor(LINES);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        insertIn(editor, 1, 1, "X");
        insertIn(editor, 3, 0, "Y");
        await settle();
        expect(isMarked(editor, 1)).toBe(true);
        expect(isMarked(editor, 3)).toBe(true);

        deleteIn(editor, 1, 1, 2);
        await settle();

        expect(isMarked(editor, 1)).toBe(false);
        expect(isMarked(editor, 3)).toBe(true);
    });

    it("keeps an earlier revision's asterisk when this revision's edit is undone", async () => {
        const { editor, rev, capture } = makeEditor(LINES);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        // Revision 1 changes the line for real.
        insertIn(editor, 2, 3, "quietly ");
        await settle();
        expect(maxRevOf(editor, 2)).toBe(1);

        // Revision 2 opens over that; its baseline is the revised text.
        rev.current = 2;
        capture(2);

        // Retype the whole line identically — destroying the revision-1 marks.
        const line = textOf(editor, 2);
        deleteIn(editor, 2, 0, line.length);
        insertIn(editor, 2, 0, line);
        await settle();

        expect(textOf(editor, 2)).toBe(line);
        // Revision 2 has nothing to say about this line...
        expect(maxRevOf(editor, 2)).toBeNull();
        // ...but the revision-1 asterisk it is still entitled to survives.
        expect(lineAttrOf(editor, 2)).toBe(1);
    });

    it("never auto-clears a line already marked when the baseline was captured", async () => {
        const { editor, rev, capture, base } = makeEditor(LINES);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        insertIn(editor, 1, 1, "X");
        await settle();
        expect(isMarked(editor, 1)).toBe(true);

        // Re-open revision 1 over the existing marks, as a project predating the
        // baseline would: the entry records `self`, so text comparison is refused.
        capture(1);
        expect(base.get("n1")?.self).toBe(true);

        deleteIn(editor, 1, 1, 2);
        await settle();

        expect(textOf(editor, 1)).toBe("A man walks in");
        expect(isMarked(editor, 1)).toBe(true);
    });

    it("marks a line that did not exist at the baseline", async () => {
        const { editor, rev, capture } = makeEditor(LINES);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        // Enter at the end of line 1 → a new empty line 2.
        editor
            .chain()
            .focus()
            .setTextSelection(insidePos(editor, 1) + LINES[1].length)
            .splitBlock()
            .run();
        await settle();

        expect(editor.state.doc.childCount).toBe(LINES.length + 1);
        // The new line is this revision's in its entirety, whatever it contains.
        expect(isMarked(editor, 2)).toBe(true);
        // ...and the line it split off from is untouched.
        expect(isMarked(editor, 1)).toBe(false);
    });

    it("anchors an asterisk when a baseline line is deleted outright", async () => {
        const { editor, rev, capture } = makeEditor(LINES);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        // Remove the whole of line 2 and the break that separates it from line 1.
        const start = insidePos(editor, 2);
        editor
            .chain()
            .focus()
            .deleteRange({ from: start - 1, to: start + LINES[2].length })
            .run();
        await settle();

        expect(editor.state.doc.childCount).toBe(LINES.length - 1);
        // The cut leaves no character to hang the mark on, so it lands on the line
        // that closed the gap — where a reader looks for what replaced it.
        expect(textOf(editor, 2)).toBe("SILENCE");
        expect(lineAttrOf(editor, 2)).toBe(1);
        // The line above it is untouched and stays clean.
        expect(isMarked(editor, 1)).toBe(false);
    });

    it("leaves nothing behind when a line created in this revision is deleted", async () => {
        const { editor, rev, capture } = makeEditor(LINES);
        rev.enabled = true;
        rev.current = 1;
        capture(1);

        editor
            .chain()
            .focus()
            .setTextSelection(insidePos(editor, 1) + LINES[1].length)
            .splitBlock()
            .run();
        await settle();
        expect(editor.state.doc.childCount).toBe(LINES.length + 1);

        // Take the new line straight back out again (Backspace at its start).
        const newStart = insidePos(editor, 2);
        editor
            .chain()
            .focus()
            .deleteRange({ from: newStart - 1, to: newStart + editor.state.doc.child(2).content.size })
            .run();
        await settle();

        expect(editor.state.doc.childCount).toBe(LINES.length);
        expect(textOf(editor, 1)).toBe(LINES[1]);
        expect(isMarked(editor, 1)).toBe(false);
    });

    it("falls back to event-based stamping when there is no baseline", async () => {
        const { editor, rev } = makeEditor(LINES);
        rev.enabled = true;
        rev.current = 1;
        rev.baseIndex = null; // project predating the baseline

        deleteIn(editor, 1, 2, 3);
        insertIn(editor, 1, 2, "m");
        await settle();

        // Documents the fallback: it over-marks rather than clearing a mark it
        // cannot justify, which is exactly the previous behaviour.
        expect(textOf(editor, 1)).toBe("A man walks in");
        expect(isMarked(editor, 1)).toBe(true);
    });

    it("ignores a baseline captured for a different revision", async () => {
        const { editor, rev, capture } = makeEditor(LINES);
        rev.enabled = true;
        rev.current = 1;
        capture(1);
        rev.current = 2; // advanced with no editor open to re-snapshot

        deleteIn(editor, 1, 2, 3);
        insertIn(editor, 1, 2, "m");
        await settle();

        expect(isMarked(editor, 1)).toBe(true);
    });
});
