/**
 * Production revisions — shared primitives.
 *
 * A revision is identified by its **index** into {@link REVISION_COLORS}:
 *   0 = White  (the base draft — no visible marks)
 *   1 = Blue   (first issued revision)
 *   2 = Pink   …
 *
 * Each top-level screenplay node carries an optional `revision` attribute (the
 * index of the revision it was last edited under — see the `RevisionAttribute`
 * BASE extension). Marks are **cumulative**: a line keeps the colour of the last
 * revision that touched it, and advancing the current revision never clears
 * existing marks. The current revision (`currentRevision` in ProductionData)
 * only decides which colour new edits are stamped with.
 *
 * Names stay in English on purpose — they are the standard production revision
 * colour order and are surfaced verbatim in printed page headers.
 */

import type { Node as PMNode } from "@tiptap/pm/model";

import { ScreenplayElement } from "../utils/enums";

export interface RevisionColor {
    name: string;
    value: string;
}

export const REVISION_COLORS: RevisionColor[] = [
    { name: "White", value: "#ffffff" },
    { name: "Blue", value: "#2f74c0" },
    { name: "Pink", value: "#d6457a" },
    { name: "Yellow", value: "#bda700" },
    { name: "Green", value: "#52a256" },
    { name: "Goldenrod", value: "#bb8c14" },
    { name: "Buff", value: "#e0c58b" },
    { name: "Salmon", value: "#fa8072" },
    { name: "Cherry", value: "#9b1c2a" },
];

/** Index of the base (White) revision — never carries a visible mark. */
export const BASE_REVISION = 0;

/**
 * How committed revision marks are surfaced in the editor. Independent of the
 * "Revision mode" toggle (which only decides whether *new* edits are stamped):
 *  - `all`     — every revision's coloured ranges, asterisks and stripes show.
 *  - `hidden`  — nothing is shown (marks stay in the document, just untinted).
 *  - `current` — only the {@link RevisionColor} at `currentRevision` is shown.
 */
export type RevisionDisplayMode = "all" | "hidden" | "current";

/** Default display mode for a project (show everything). */
export const DEFAULT_REVISION_DISPLAY_MODE: RevisionDisplayMode = "all";

/**
 * Transaction meta set on the revision-stamping transaction (the appended tr
 * that writes the `revision` attr onto edited lines). Stamping only changes an
 * attribute — never layout — so the pagination plugin skips it exactly like it
 * skips `nodeDedupId`, avoiding a redundant second measure pass per keystroke.
 * Defined here (a leaf module — it imports only the element enum) so both the
 * pagination and revisions extensions can import it without a cycle.
 */
export const REVISION_STAMP_META = "revisionStamp";

/** Mark type name; the inline mark that stamps changed text with its revision index. */
export const REVISION_MARK = "revision";

/** Top-level block types that can carry the node-level `revision` attribute. */
export const STAMP_TYPES = new Set<string>([
    ScreenplayElement.Scene,
    ScreenplayElement.Action,
    ScreenplayElement.Character,
    ScreenplayElement.Dialogue,
    ScreenplayElement.Parenthetical,
    ScreenplayElement.Transition,
    ScreenplayElement.Section,
    ScreenplayElement.Note,
    ScreenplayElement.DualDialogue,
]);

/** Clamp an arbitrary index into the colour list's bounds. */
export const clampRevision = (index: number): number => Math.max(0, Math.min(index, REVISION_COLORS.length - 1));

/** Hex colour for a revision index, or `undefined` for the base/out-of-range. */
export const revisionColor = (index: number | null | undefined): string | undefined => {
    if (index == null || index < 1 || index >= REVISION_COLORS.length) return undefined;
    return REVISION_COLORS[index].value;
};

/** Next revision index (the colour a draft-lock or "advance" moves to). Caps at the last colour. */
export const nextRevision = (index: number): number => clampRevision(index + 1);

// ---------------------------------------------------------------------------
// Baseline — the text each line held when the current revision opened
// ---------------------------------------------------------------------------

/**
 * Why a baseline exists at all.
 *
 * In production the right-margin asterisk means "this line DIFFERS from the last
 * coloured pages that went out" — a statement about content, which is what lets a
 * script supervisor scan the margin instead of re-reading the scene. Stamping
 * from edit events only approximates that: it says "this line was TOUCHED". The
 * two agree until someone changes their mind, at which point deleting a character
 * and retyping it, or typing one and deleting it, leaves a line marked as revised
 * that is character-for-character identical to the draft it is being compared to.
 *
 * Recording what each line held when the revision opened turns the mark into a
 * pure function of (baseline, current text). Beyond matching the real definition,
 * that makes stamping idempotent and convergent — every client computing from the
 * same baseline and the same text arrives at the same marks with no coordination,
 * which event-accumulation cannot promise in a collaborative document.
 */

/**
 * One line's state when the current revision opened. An absent entry means the
 * line did not exist at capture time, so it is new and belongs to this revision
 * in its entirety.
 */
export type RevisionBaseEntry = {
    /** The line's text at capture time. Reading back identical means restored. */
    text: string;
    /**
     * Highest revision index the line was ALREADY marked at when the baseline was
     * captured, if any.
     *
     * Restoring a line's text cannot restore those older marks: the characters
     * carrying them were destroyed by the very edit now being undone, and the
     * baseline stores text, not mark runs. Without this the line would come back
     * completely unmarked and silently lose an asterisk it is still entitled to.
     * Re-stamping the node at this index keeps that asterisk, in the right colour.
     */
    prior?: number;
    /**
     * The line already carried THIS revision's mark at capture time — a project
     * that predates the baseline, or a revision re-opened over existing marks. Its
     * text was never measured against this revision, so it is treated as
     * permanently differing and never auto-cleared rather than being judged
     * against a comparison that was never taken.
     */
    self?: boolean;
};

/**
 * Baseline lookup handed to the revisions extension. `index` is the revision the
 * baseline was captured for; stamping only takes the derived path when it matches
 * the current revision, so a missing or stale baseline falls back to the
 * event-based path rather than clearing marks against the wrong draft.
 */
export type RevisionBaseline = {
    index: number;
    get: (dataId: string) => RevisionBaseEntry | undefined;
};

/**
 * A run of `next` that differs from the baseline, in `next`'s own offsets. A
 * collapsed run (`to === from`) is a deletion point: nothing survives to colour,
 * so the caller anchors the line's asterisk there instead.
 */
export type DiffRun = { from: number; to: number };

/**
 * Largest trimmed middle worth diffing properly. Past this the changed region is
 * a rewrite rather than an edit, and one coarse run covering it is both the right
 * answer and the cheap one. Comfortably above a screenplay paragraph, which the
 * narrow text column and the convention of short action blocks keep well under
 * this in practice.
 */
const DIFF_LIMIT = 400;

/**
 * Move an inserted run to the alignment that reflects what the user actually did.
 *
 * When the inserted text repeats what already surrounds it, several alignments
 * produce the identical final string, and the text alone cannot say which is the
 * new copy. Typing "it's " immediately before an existing "it's" is the plain
 * case: both "Hey, [it's ]it's you" and "Hey, it's [it's ]you" reconstruct the
 * same sentence, and a prefix trim always lands on the second — colouring the
 * copy that was already there and leaving the new one looking original. The same
 * ambiguity is what smears a run off its word boundary, marking the "s" of "sits"
 * in "He [tands and s]its" instead of the "stands and " that was really typed.
 *
 * `anchor` is where the user's caret actually inserted, in the same offsets as
 * `next`, which resolves it exactly — the diff supplies what changed, the edit
 * supplies where. With no anchor available, the leftmost equivalent alignment is
 * the conventional choice (the same "shift the hunk up" rule diff tools use) and
 * keeps runs on word boundaries far more often than the trim's rightmost.
 *
 * `leftBound`/`rightBound` keep a run from sliding into its neighbours.
 */
const slideRun = (next: string, run: DiffRun, leftBound: number, rightBound: number, anchor: number): DiffRun => {
    const len = run.to - run.from;
    // Slide left while the character before the run repeats its last character,
    // and right while the character after it repeats its first — the two moves
    // that leave the reconstructed string untouched.
    let lo = run.from;
    while (lo > leftBound && next.charCodeAt(lo - 1) === next.charCodeAt(lo + len - 1)) lo--;
    let hi = run.from;
    while (hi + len < rightBound && next.charCodeAt(hi + len) === next.charCodeAt(hi)) hi++;
    const at = anchor < 0 ? lo : Math.max(lo, Math.min(anchor, hi));
    return { from: at, to: at + len };
};

/**
 * Every run of `next` that differs from `prev`, left to right; empty when they
 * are identical.
 *
 * A common prefix/suffix trim alone is NOT enough, which is worth stating plainly
 * because it is tempting and wrong: it can only describe one contiguous region,
 * so a paragraph edited near its start and again near its end reports a single
 * run spanning everything between the two — colouring and asterisking the
 * untouched middle. Because the baseline lives for the whole revision, that is
 * the normal way a paragraph gets revised, not a rare case.
 *
 * So the trim only narrows the problem (and answers a single edit outright), and
 * an LCS over what remains recovers the individual runs. Costs a table over the
 * trimmed middle for the handful of short lines an edit touched, on the already
 * debounced flush — the common case never reaches it, because one edit leaves one
 * side of the trim empty.
 */
export const diffRuns = (prev: string, next: string, anchor = -1): DiffRun[] => {
    if (prev === next) return [];

    const max = Math.min(prev.length, next.length);
    let p = 0;
    while (p < max && prev.charCodeAt(p) === next.charCodeAt(p)) p++;
    let s = 0;
    while (s < max - p && prev.charCodeAt(prev.length - 1 - s) === next.charCodeAt(next.length - 1 - s)) s++;

    const a = prev.slice(p, prev.length - s);
    const b = next.slice(p, next.length - s);
    const n = a.length;
    const m = b.length;

    // One side empty → a pure insertion or a pure deletion, already exact. Over
    // the limit → treat the whole region as rewritten.
    if (n === 0 || m === 0 || n > DIFF_LIMIT || m > DIFF_LIMIT) {
        const run = { from: p, to: p + m };
        return m > 0 ? [slideRun(next, run, 0, next.length, anchor)] : [run];
    }

    // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..].
    const w = m + 1;
    const lcs = new Uint16Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
        const ai = a.charCodeAt(i);
        for (let j = m - 1; j >= 0; j--) {
            lcs[i * w + j] =
                ai === b.charCodeAt(j)
                    ? lcs[(i + 1) * w + (j + 1)] + 1
                    : Math.max(lcs[(i + 1) * w + j], lcs[i * w + (j + 1)]);
        }
    }

    // `pure` marks a run that only ADDED characters. Those are the ones whose
    // alignment is ambiguous and can be slid; a run that also dropped characters
    // is pinned by what it replaced.
    const runs: (DiffRun & { pure: boolean })[] = [];
    let i = 0;
    let j = 0;
    let runStart = -1;
    let runPure = true;
    const openRun = (dropped: boolean) => {
        if (runStart < 0) {
            runStart = p + j;
            runPure = true;
        }
        if (dropped) runPure = false;
    };
    const closeRun = () => {
        if (runStart < 0) return;
        runs.push({ from: runStart, to: p + j, pure: runPure });
        runStart = -1;
    };

    while (i < n && j < m) {
        if (a.charCodeAt(i) === b.charCodeAt(j)) {
            closeRun();
            i++;
            j++;
        } else if (lcs[(i + 1) * w + j] >= lcs[i * w + (j + 1)]) {
            openRun(true); // a[i] dropped
            i++;
        } else {
            openRun(false); // b[j] added
            j++;
        }
    }
    if (runStart < 0 && (i < n || j < m)) openRun(i < n);
    else if (i < n) runPure = false;
    j = m;
    closeRun();

    // Resolve alignment ambiguity, bounded by the neighbouring runs so a slide
    // can never cross one.
    return runs.map((r, k) => {
        if (!r.pure || r.to === r.from) return { from: r.from, to: r.to };
        const leftBound = k > 0 ? runs[k - 1].to : 0;
        const rightBound = k + 1 < runs.length ? runs[k + 1].from : next.length;
        return slideRun(next, r, leftBound, rightBound, anchor);
    });
};

/**
 * Revision marks already on a top-level node: whether one sits at `rev`, and the
 * highest index below it. One walk, since the baseline needs both.
 */
export const nodeRevisions = (node: PMNode, rev: number): { self: boolean; prior?: number } => {
    let self = false;
    let prior: number | undefined;
    const note = (index: unknown) => {
        if (typeof index !== "number") return;
        if (index === rev) self = true;
        else if (index < rev && (prior === undefined || index > prior)) prior = index;
    };
    note(node.attrs.revision);
    node.descendants((child) => {
        if (!child.isText) return true;
        for (const m of child.marks) if (m.type.name === REVISION_MARK) note(m.attrs.index);
        return false;
    });
    return { self, prior };
};

/**
 * Snapshot every top-level line, keyed by its stable `data-id`, to serve as the
 * baseline for revision `rev` — see {@link RevisionBaseEntry}.
 *
 * Captured eagerly when a revision opens rather than lazily on first edit: a
 * client that is offline when a line is first touched would capture a baseline
 * from stale text, whereas a snapshot written once at revision open is the same
 * for everyone. One text copy of the screenplay (~150–250 KB for a feature), and
 * it REPLACES the previous baseline on each advance rather than accumulating.
 */
export const captureRevisionBaseline = (doc: PMNode, rev: number): Map<string, RevisionBaseEntry> => {
    const base = new Map<string, RevisionBaseEntry>();
    doc.forEach((node) => {
        const id = node.attrs["data-id"];
        if (typeof id !== "string" || !STAMP_TYPES.has(node.type.name)) return;
        const { self, prior } = nodeRevisions(node, rev);
        const entry: RevisionBaseEntry = { text: node.textContent };
        if (self) entry.self = true;
        if (prior !== undefined) entry.prior = prior;
        base.set(id, entry);
    });
    return base;
};
