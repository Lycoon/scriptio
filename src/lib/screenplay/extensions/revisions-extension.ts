import { Editor, Extension, Mark, mergeAttributes } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

import {
    DiffRun,
    REVISION_COLORS,
    REVISION_MARK,
    REVISION_STAMP_META,
    RevisionBaseline,
    RevisionDisplayMode,
    STAMP_TYPES,
    diffRuns,
    revisionColor,
} from "../revisions";
import { paginationKey } from "./pagination-extension";
import { timeApply } from "./apply-timing";

/** Key of the revisions plugin; its state is the {@link Pending} edit set.
 *  Exported so tests can assert that a flush consumed it. */
export const revisionsPluginKey = new PluginKey<Pending>("revisions");
const REFRESH_META = "revisionsRefresh";
/** Idle delay (ms) before accumulated revision edits are written to the document.
 *  Keeps the per-keystroke path free of the document write; marks appear shortly
 *  after the user pauses. */
const FLUSH_DELAY = 220;

/**
 * Schema-level `revision` inline MARK: stamps the actual changed *text* with the
 * index of the revision it was last edited under (see
 * `src/lib/screenplay/revisions.ts`). A mark (not a node attribute) so a change
 * is tracked at character granularity — only the edited run of text is marked,
 * which lets an asterisk land on the specific changed line rather than the whole
 * paragraph. It also colours the changed text in the revision colour.
 *
 * Placed in BASE_EXTENSIONS (like the other marks) so it lives in
 * `ScreenplaySchema` and survives full-project `.scriptio` (de)serialization.
 * `inclusive: false` so typing at a mark boundary doesn't auto-extend an older
 * revision — new text is always stamped explicitly by the plugin below.
 */
export const RevisionMark = Mark.create({
    name: REVISION_MARK,
    inclusive: false,

    addAttributes() {
        return {
            index: {
                default: 1,
                parseHTML: (element) => {
                    const v = element.getAttribute("data-revision");
                    return v !== null ? parseInt(v, 10) : 1;
                },
                renderHTML: (attributes) => ({ "data-revision": String(attributes.index) }),
            },
            // "ins" → inserted text (coloured); "del" → an invisible anchor on a
            // surviving character at a deletion point, so the asterisk lands on
            // the right line without recolouring text that wasn't added.
            kind: {
                default: "ins",
                parseHTML: (element) => element.getAttribute("data-revision-kind") || "ins",
                renderHTML: (attributes) => (attributes.kind === "del" ? { "data-revision-kind": "del" } : {}),
            },
        };
    },

    parseHTML() {
        return [{ tag: "span[data-revision]" }];
    },

    renderHTML({ HTMLAttributes, mark }) {
        // Colour inserted text in its revision colour; deletion anchors stay
        // invisible (they only position the asterisk). Inline style overrides
        // the generic `> p span` editor-text colour. The colour is read from a
        // per-index CSS variable so the runtime can re-tint marks by display
        // mode (all/hidden/current) without a document write; the literal colour
        // is the fallback for contexts with no plugin (exports, previews).
        const index = mark.attrs.index as number;
        const color = mark.attrs.kind === "del" ? undefined : revisionColor(index);
        const style = color ? { style: `color: var(${colorVar(index)}, ${color})` } : {};
        return ["span", mergeAttributes(HTMLAttributes, style), 0];
    },
});

/**
 * Schema-level `revision` node ATTRIBUTE — the revision index a *line* was
 * changed under, used only for changes that leave no markable text: a new empty
 * line (Enter) or a deletion that empties a node. The mark above handles
 * text-bearing edits; this covers the empty-line cases so they still get an
 * asterisk + page stripe. `default: null` so y-prosemirror persists nothing for
 * the vast majority of lines (zero storage, zero hot-path cost). In
 * BASE_EXTENSIONS so it round-trips like the mark.
 */
export const RevisionAttribute = Extension.create({
    name: "revisionAttribute",

    addGlobalAttributes() {
        return [
            {
                types: [...STAMP_TYPES],
                attributes: {
                    revision: {
                        default: null,
                        parseHTML: (element) => {
                            const v = element.getAttribute("data-revision-line");
                            return v !== null ? parseInt(v, 10) : null;
                        },
                        renderHTML: (attributes) =>
                            attributes.revision != null ? { "data-revision-line": String(attributes.revision) } : {},
                    },
                },
            },
        ];
    },
});

type RevisionsConfig = {
    /** Stamping switch: whether NEW edits are recorded as revisions. */
    getRevisionsEnabled: () => boolean;
    getCurrentRevision: () => number;
    /** Display switch: how committed marks are shown (independent of stamping). */
    getDisplayMode: () => RevisionDisplayMode;
    /** Per-line text as of this revision's opening, or null when none has been
     *  captured — see {@link RevisionBaseline}. Consulted once per flush. */
    getBaseline?: () => RevisionBaseline | null;
};

/** CSS custom property a `revision` mark of index `i` reads for its text colour.
 *  Set on the editor root per display mode so the committed marks can be tinted
 *  (all), neutralised (hidden) or filtered to the current revision with no
 *  document write — see {@link applyColorVars}. */
const colorVar = (index: number) => `--rev-color-${index}`;

/** Re-tint the committed revision marks for the given display mode by (re)defining
 *  each revision's colour variable on the editor root: its real colour when that
 *  revision is shown, else `--editor-text` so the text reads normally. */
const applyColorVars = (dom: HTMLElement, mode: RevisionDisplayMode, current: number): void => {
    for (let i = 1; i < REVISION_COLORS.length; i++) {
        const shown = mode === "all" || (mode === "current" && i === current);
        dom.style.setProperty(colorVar(i), shown ? REVISION_COLORS[i].value : "var(--editor-text)");
    }
};

// ---------------------------------------------------------------------------
// Stamping — accumulate per keystroke (cheap), apply on a debounce (off the
// keypress path). The expensive document write happens once after the user
// pauses, not on every key event.
// ---------------------------------------------------------------------------

type Range = { from: number; to: number };

/** Pending, not-yet-applied revision edits, carried in plugin state and mapped
 *  forward on every transaction so positions stay valid until the flush. */
type Pending = {
    /** Inserted/replaced text ranges to mark (and colour). Merged when adjacent. */
    ins: Range[];
    /** Deletion points — an asterisk is anchored to a surviving adjacent char. */
    del: number[];
    /** Touched span, for finding empty new lines (Enter) at flush time. */
    lo: number;
    hi: number;
    /** `data-id`s of top-level lines that existed before this edit window and are
     *  gone from the document now. The one thing comparing surviving lines against
     *  the baseline cannot see: when a whole line is removed, every line that
     *  remains may still match its baseline exactly, yet the deletion is real and
     *  the adjacent line has to carry its asterisk. Ids, not positions, so nothing
     *  needs mapping forward. */
    gone: Set<string>;
    /** Whether anything is waiting to be flushed. */
    dirty: boolean;
};

const EMPTY_PENDING: Pending = { ins: [], del: [], lo: Infinity, hi: -Infinity, gone: new Set(), dirty: false };

/** Merge overlapping/adjacent ranges so continuous typing stays O(1) entries. */
const mergeRanges = (ranges: Range[]): Range[] => {
    if (ranges.length <= 1) return ranges;
    ranges.sort((a, b) => a.from - b.from);
    const out: Range[] = [{ ...ranges[0] }];
    for (let i = 1; i < ranges.length; i++) {
        const last = out[out.length - 1];
        if (ranges[i].from <= last.to) last.to = Math.max(last.to, ranges[i].to);
        else out.push({ ...ranges[i] });
    }
    return out;
};

/** Invoke `cb(from, to)` for each range a single transaction changed, in its
 *  result-doc coordinates. A collapsed range (`to === from`) is a deletion. */
const forEachChange = (tr: Transaction, cb: (from: number, to: number) => void): void => {
    const size = tr.doc.content.size;
    tr.mapping.maps.forEach((map, i) => {
        const rest = tr.mapping.slice(i + 1);
        map.forEach((_os: number, _oe: number, ns: number, ne: number) => {
            cb(Math.max(0, Math.min(rest.map(ns, -1), size)), Math.max(0, Math.min(rest.map(ne, 1), size)));
        });
    });
};

/**
 * Revision indices carried by a node's TEXT — deliberately ignoring the
 * node-level attribute, which the caller has to reason about separately: the
 * attribute is what gets rewritten, the marks are the evidence for what it
 * should say.
 */
const textRevisions = (node: PMNode, rev: number): { self: boolean; prior?: number } => {
    let self = false;
    let prior: number | undefined;
    node.descendants((child) => {
        if (!child.isText) return true;
        for (const m of child.marks) {
            if (m.type.name !== REVISION_MARK) continue;
            const i = m.attrs.index;
            if (typeof i !== "number") continue;
            if (i === rev) self = true;
            else if (i < rev && (prior === undefined || i > prior)) prior = i;
        }
        return false;
    });
    return { self, prior };
};

/**
 * Text spans of a node already carrying revision `rev`'s "ins" mark, in line-local
 * offsets, touching spans merged.
 *
 * What earlier stamping on this line concluded had been added — kept as alignment
 * evidence for the rewrite that is about to drop it, since it covers the
 * keystrokes that have already left `pending` (see {@link diffRuns}).
 */
const markedInsRuns = (node: PMNode, rev: number): DiffRun[] => {
    const out: DiffRun[] = [];
    node.descendants((child, off) => {
        if (!child.isText) return true;
        const marked = child.marks.some(
            (m) => m.type.name === REVISION_MARK && m.attrs.index === rev && m.attrs.kind === "ins",
        );
        if (!marked) return false;
        const last = out[out.length - 1];
        if (last && last.to === off) last.to = off + child.nodeSize;
        else out.push({ from: off, to: off + child.nodeSize });
        return false;
    });
    return out;
};

/** Stable `data-id`s of the top-level lines overlapping [from, to] in `doc`. */
const idsInSpan = (doc: PMNode, from: number, to: number): string[] => {
    const size = doc.content.size;
    const lo = Math.max(0, Math.min(from, size));
    const hi = Math.max(lo, Math.min(to, size));
    const out: string[] = [];
    doc.nodesBetween(lo, hi, (node, _pos, parent) => {
        if (parent !== doc) return false;
        const id = node.attrs["data-id"];
        if (typeof id === "string") out.push(id);
        return false;
    });
    return out;
};

/**
 * Lines present before this transaction and absent after it, as `data-id`s.
 *
 * Gated on the document's top-level child count actually shrinking, which is an
 * O(1) read and false for every keystroke — typing, and any edit confined to one
 * line, can never drop a block. Only when a block really disappears do the two
 * bounded walks run, over the changed span alone rather than the whole document.
 *
 * A transaction that deletes one line and adds another leaves the count equal and
 * is skipped. That under-reports rather than over-reports: the surviving lines are
 * still compared against the baseline, so a real content change is still marked —
 * only the anchor for the vanished line is missed, and any edit that produced it
 * has almost certainly changed a neighbouring line's text too.
 */
const goneIds = (tr: Transaction, oldDoc: PMNode, newDoc: PMNode, lo: number, hi: number): string[] => {
    if (newDoc.childCount >= oldDoc.childCount) return [];

    // The removed span in ORIGINAL-document coordinates. Mapping the result span
    // backwards is not enough: a deletion collapses to a single point in the
    // result, so inverting it yields a point too — a window that covers the line
    // the join landed in and misses the line that was taken out, which is the only
    // one being looked for. Each step's own map reports what it removed in its
    // INPUT coordinates, so rebase those onto the original doc.
    //
    // The rebase is built from a COPY of the preceding maps rather than from
    // `tr.mapping.slice(0, i)`: a sliced Mapping only honours its bounds in `map`,
    // while `invert()` walks the whole underlying array (it delegates to
    // `appendMappingInverted`, which ignores `from`/`to`). So the sliced-and-
    // inverted mapping ran this step's own inverse too, and at i = 0 — a plain
    // one-step Backspace — `back` was that inverse instead of the identity. Every
    // reported span then came out shifted by the size of the cut, sweeping the
    // untouched line just past it into `before` and reporting it as removed.
    const maps = tr.mapping.maps;
    let oLo = Infinity;
    let oHi = -Infinity;
    maps.forEach((map, i) => {
        const back = i === 0 ? null : new Mapping(maps.slice(0, i)).invert();
        map.forEach((os: number, oe: number) => {
            const a = back ? back.map(os, -1) : os;
            const b = back ? back.map(oe, 1) : oe;
            if (a < oLo) oLo = a;
            if (b > oHi) oHi = b;
        });
    });
    if (oLo === Infinity) return [];

    const before = idsInSpan(oldDoc, oLo - 1, oHi + 1);
    if (before.length === 0) return [];
    const after = new Set(idsInSpan(newDoc, lo - 1, hi + 1));
    return before.filter((id) => !after.has(id));
};

/**
 * Build the (single) transaction that applies all pending revision edits at
 * revision `rev`, or null if there's nothing to apply:
 *  - inserted text → revision mark (kind "ins"), which colours it and locates
 *    its asterisks per visual line;
 *  - each deletion point → an invisible mark (kind "del") on a surviving
 *    adjacent character, so the asterisk lands on the deletion's own line
 *    without recolouring text;
 *  - empty lines the edits touched (new blank lines / emptied nodes) → the node
 *    attribute, since they have no character to anchor.
 * Tagged `REVISION_STAMP_META` so pagination skips it and the plugin clears
 * pending when it lands.
 *
 * Returning null means "nothing to write" — NOT "nothing happened". Several
 * pending edits legitimately produce no change (see the `continue`s below), and
 * the caller must still consume the pending set in that case; see `flush`.
 */
const buildStampTransaction = (state: EditorState, pending: Pending, rev: number): Transaction | null => {
    const markType = state.schema.marks[REVISION_MARK];
    if (!markType) return null;

    const doc = state.doc;
    const size = doc.content.size;
    const clamp = (p: number) => Math.max(0, Math.min(p, size));
    const insMark = markType.create({ index: rev, kind: "ins" });
    const delMark = markType.create({ index: rev, kind: "del" });
    let tr: Transaction | null = null;
    const attrNodes = new Set<number>();

    for (const r of pending.ins) {
        const from = clamp(r.from);
        const to = clamp(r.to);
        if (to > from) {
            tr = tr ?? state.tr;
            tr.addMark(from, to, insMark);
        }
    }

    for (const point of pending.del) {
        const at = clamp(point);
        const $at = doc.resolve(at);
        if (!$at.parent.isTextblock) continue;
        // Anchor the asterisk on a surviving adjacent character — but never on
        // one that already carries a revision mark. The `revision` mark excludes
        // its own type, so stamping a "del" anchor over an existing "ins" run
        // would strip that character's colour (deletion eating the colour off
        // the surviving char). When the neighbour is already marked the line
        // keeps its asterisk from that mark, so the anchor is redundant.
        //
        // Check against the in-progress transaction's doc, not `state.doc`:
        // `addMark` never shifts positions, but the `ins` loop above (and prior
        // del points) may already have marked this very character earlier in the
        // SAME flush — e.g. a char typed then a later char deleted before the
        // debounce fired. `state.doc` wouldn't show that mark yet.
        const markedDoc = tr ? tr.doc : doc;
        if (at < $at.end()) {
            if (markedDoc.rangeHasMark(at, at + 1, markType)) continue;
            tr = tr ?? state.tr;
            tr.addMark(at, at + 1, delMark);
        } else if (at > $at.start()) {
            if (markedDoc.rangeHasMark(at - 1, at, markType)) continue;
            tr = tr ?? state.tr;
            tr.addMark(at - 1, at, delMark);
        } else if ($at.depth >= 1) {
            attrNodes.add($at.before(1)); // emptied line — anchor on the node
        }
    }

    // Empty top-level nodes within the touched span (new blank lines from Enter).
    if (pending.lo !== Infinity) {
        const wLo = Math.max(0, clamp(pending.lo) - 1);
        const wHi = clamp(pending.hi + 1);
        doc.nodesBetween(wLo, wHi, (node, pos, parent) => {
            if (parent !== doc) return false;
            if (STAMP_TYPES.has(node.type.name) && node.content.size === 0) attrNodes.add(pos);
            return false;
        });
    }

    for (const pos of attrNodes) {
        const node = doc.nodeAt(pos);
        if (!node || !STAMP_TYPES.has(node.type.name) || node.attrs.revision === rev) continue;
        tr = tr ?? state.tr;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, revision: rev });
    }

    if (tr) tr.setMeta(REVISION_STAMP_META, true);
    return tr;
};

/**
 * Build the stamp transaction by COMPARING each touched line against the baseline
 * captured when this revision opened, rather than by replaying the edit events
 * that reached it. See the note above {@link RevisionBaseEntry} for why the
 * comparison is the definition and the events are only an approximation of it.
 *
 * Per top-level line the edit window touched:
 *  - no baseline entry → the line is new; mark all of it;
 *  - baseline is `null` → already revised when the baseline was taken; leave its
 *    marks alone and re-stamp, never clear;
 *  - baseline equals the current text → RESTORED; drop this revision's marks;
 *  - otherwise → mark exactly the run that differs.
 *
 * Cost is a string compare plus an O(len) two-sided trim for the handful of short
 * lines an edit touched, on the already-debounced flush — strictly less work than
 * the position bookkeeping the event path does on every keystroke.
 *
 * Note the comparison is on text only: reverting a line's words but leaving new
 * bold or italic on them reads as restored. Production revision marks track
 * dialogue and action changing, not styling, so that is the intended reading.
 */
const buildDerivedStampTransaction = (
    state: EditorState,
    pending: Pending,
    rev: number,
    baseline: RevisionBaseline,
): Transaction | null => {
    const markType = state.schema.marks[REVISION_MARK];
    if (!markType || pending.lo === Infinity) return null;

    const doc = state.doc;
    const size = doc.content.size;
    const clamp = (p: number) => Math.max(0, Math.min(p, size));
    const insMark = markType.create({ index: rev, kind: "ins" });
    const delMark = markType.create({ index: rev, kind: "del" });
    let tr: Transaction | null = null;

    // Did this window remove a line that existed at the baseline? A line the user
    // created and then removed inside the same revision leaves nothing to report —
    // that is precisely the "type a character, delete it, keep the asterisk
    // forever" case the event path could not distinguish.
    let removedBaselineLine = false;
    for (const id of pending.gone) {
        if (baseline.get(id) !== undefined) {
            removedBaselineLine = true;
            break;
        }
    }

    const wLo = Math.max(0, clamp(pending.lo) - 1);
    const wHi = clamp(pending.hi + 1);

    doc.nodesBetween(wLo, wHi, (node, pos, parent) => {
        if (parent !== doc) return false;
        if (!STAMP_TYPES.has(node.type.name)) return false;

        const id = node.attrs["data-id"];
        const base = typeof id === "string" ? baseline.get(id) : undefined;
        const text = node.textContent;
        const start = pos + 1;

        // Restored to the draft this revision is measured against: retract this
        // revision's marks. Earlier revisions' marks on surviving characters are
        // left untouched — safe by construction, since the baseline was captured
        // when revision `rev` opened and its text already contains revisions
        // 1..rev-1 — and `prior` restores the asterisk for any that the edit being
        // undone destroyed along with the characters carrying them.
        if (base !== undefined && !base.self && base.text === text) {
            const end = start + node.content.size;
            const marks = node.content.size > 0 ? textRevisions(node, rev) : { self: false, prior: undefined };

            if (marks.self) {
                tr = tr ?? state.tr;
                tr.removeMark(start, end, insMark);
                tr.removeMark(start, end, delMark);
            }

            // A node stamp with NO marked text of its own is a deletion anchor: it
            // records that material NEXT TO this line was cut, which comparing this
            // line's text can neither confirm nor refute. Left alone deliberately —
            // it is the one piece of state not recoverable from (baseline, text),
            // so rewriting it would drop the only trace of that deletion the next
            // time any edit happened to touch this line.
            const bareAnchor = !marks.self && node.attrs.revision === rev;
            if (!bareAnchor) {
                // An older revision still marked on surviving characters shows its
                // own asterisk. Only when none survives does the line need `prior`
                // written to the node — the edit just undone destroyed those marks
                // along with the characters that carried them.
                const rescue = marks.prior === undefined ? base.prior : undefined;
                let want: number | null | undefined;
                if (node.attrs.revision === rev) want = rescue ?? null;
                else if (rescue !== undefined && node.attrs.revision == null) want = rescue;
                if (want !== undefined && node.attrs.revision !== want) {
                    tr = tr ?? state.tr;
                    tr.setNodeMarkup(pos, undefined, { ...node.attrs, revision: want });
                }
            }
            return false;
        }

        // Empty line (a fresh Enter, or one emptied by this edit) — no character
        // to hang a mark on, so the node attribute carries the asterisk.
        if (node.content.size === 0) {
            if (node.attrs.revision !== rev) {
                tr = tr ?? state.tr;
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, revision: rev });
            }
            return false;
        }

        // New line, or one already revised when the baseline was captured: the whole
        // thing is this revision's, with no alignment to resolve. Otherwise, exactly
        // the runs that differ — which is where `added` earns its keep.
        const nodeEnd = start + node.content.size;
        let runs: DiffRun[];
        if (base === undefined || base.self) {
            runs = [{ from: 0, to: text.length }];
        } else {
            // Which of this line's characters are known to be this revision's, in the
            // line's own offsets. Comparing against the baseline says WHAT changed but
            // cannot say which of several identical alignments the user meant; this is
            // the other half of that answer (see the note on `slideRun`), and it comes
            // from both directions in time: the caret's own insertions, still sitting
            // in the pending set, and the runs earlier flushes already marked — the
            // keystrokes pending no longer remembers, which ProseMirror has been
            // mapping forward for us and the rewrite below is about to drop.
            const added = markedInsRuns(node, rev);
            for (const r of pending.ins) {
                const from = Math.max(r.from - start, 0);
                const to = Math.min(r.to - start, text.length);
                if (to > from) added.push({ from, to });
            }
            runs = diffRuns(base.text, text, added);
        }
        if (runs.length === 0) return false;

        // RECOMPUTE rather than accumulate: drop whatever an earlier flush wrote at
        // this revision before re-applying. A previous flush saw an earlier version
        // of this line and may have marked a wider span than the current text
        // justifies — most obviously the single region spanning two separate edits
        // that a prefix/suffix trim used to report. Only a full rewrite makes the
        // committed marks a true function of (baseline, text); adding to them would
        // let the coarser earlier answer survive underneath as stale colour.
        if (doc.rangeHasMark(start, nodeEnd, insMark) || doc.rangeHasMark(start, nodeEnd, delMark)) {
            tr = tr ?? state.tr;
            tr.removeMark(start, nodeEnd, insMark);
            tr.removeMark(start, nodeEnd, delMark);
        }

        for (const run of runs) {
            if (run.to > run.from) {
                tr = tr ?? state.tr;
                tr.addMark(clamp(start + run.from), clamp(start + run.to), insMark);
                continue;
            }

            // Collapsed run: text was only removed here. Anchor the asterisk on a
            // surviving neighbouring character, skipping one that already carries a
            // revision mark — the `revision` mark excludes its own type, so stamping
            // a "del" anchor over an existing "ins" run would strip that character's
            // colour, and the line keeps its asterisk from that mark anyway.
            const at = clamp(start + run.from);
            const $at = doc.resolve(at);
            if (!$at.parent.isTextblock) continue;
            // Against the in-progress doc, so runs already applied in this same
            // rewrite (and other revisions' marks) are both visible.
            const markedDoc = tr ? (tr as Transaction).doc : doc;
            if (at < $at.end()) {
                if (markedDoc.rangeHasMark(at, at + 1, markType)) continue;
                tr = tr ?? state.tr;
                tr.addMark(at, at + 1, delMark);
            } else if (at > $at.start()) {
                if (markedDoc.rangeHasMark(at - 1, at, markType)) continue;
                tr = tr ?? state.tr;
                tr.addMark(at - 1, at, delMark);
            }
        }
        return false;
    });

    // A whole line that existed at the baseline vanished, and every surviving line
    // still matches its own baseline — so nothing above marked anything, yet the
    // cut is real and has to show. Anchor it on the line left beside the gap.
    if (removedBaselineLine && !tr) {
        const stampNode = (nodePos: number) => {
            const n = doc.nodeAt(nodePos);
            if (!n || !STAMP_TYPES.has(n.type.name) || n.attrs.revision === rev) return;
            tr = tr ?? state.tr;
            tr.setNodeMarkup(nodePos, undefined, { ...n.attrs, revision: rev });
        };

        for (const point of pending.del) {
            const at = clamp(point);
            const $at = doc.resolve(at);

            if ($at.parent.isTextblock) {
                // Inside a surviving line — hang the asterisk invisibly off an
                // adjacent character, never one already carrying a mark.
                if (at < $at.end() && !doc.rangeHasMark(at, at + 1, markType)) {
                    tr = tr ?? state.tr;
                    tr.addMark(at, at + 1, delMark);
                } else if (at > $at.start() && !doc.rangeHasMark(at - 1, at, markType)) {
                    tr = tr ?? state.tr;
                    tr.addMark(at - 1, at, delMark);
                } else if ($at.depth >= 1 && $at.start() === $at.end()) {
                    stampNode($at.before(1)); // emptied line — nothing to hang on
                }
            } else if ($at.depth === 0) {
                // BETWEEN two blocks: this is the removed line's own position, so
                // no character survives to carry the mark. Stamp the line that
                // closed the gap — the one now following the cut, which is where a
                // reader looks for what replaced it — and fall back to the line
                // before it when the cut ran to the end of the document.
                const after = $at.nodeAfter;
                if (after && STAMP_TYPES.has(after.type.name)) stampNode(at);
                else {
                    const before = $at.nodeBefore;
                    if (before && STAMP_TYPES.has(before.type.name)) stampNode(at - before.nodeSize);
                }
            }
            if (tr) break;
        }
    }

    if (tr) (tr as Transaction).setMeta(REVISION_STAMP_META, true);
    return tr;
};

// ---------------------------------------------------------------------------
// Overlay rendering
// ---------------------------------------------------------------------------

/** Gutter offset (px) of the stripe to the LEFT of the page, in the canvas. */
const STRIPE_LEFT = -22;
/** Stripe width (px). */
const STRIPE_WIDTH = 5;
/** Fallback offset (px) of the stripe INSIDE the page's left margin, used when
 *  the canvas has no room for the gutter placement (see the stripe geometry in
 *  `renderOverlay`). Far short of the 1.5in text-column indent, so it lands on
 *  empty page margin whatever the format. */
const STRIPE_INSIDE_LEFT = 10;
/** Asterisk inset (px) into the right page margin, just past the text column. */
const ASTERISK_INSET = 12;

/** Nearest scrollable ancestor (the editor's scroll container), or null. */
const findScroller = (el: HTMLElement): HTMLElement | null => {
    let node: HTMLElement | null = el.parentElement;
    while (node) {
        const oy = getComputedStyle(node).overflowY;
        if (oy === "auto" || oy === "scroll" || oy === "overlay") return node;
        node = node.parentElement;
    }
    return null;
};

const numVar = (style: CSSStyleDeclaration, name: string): number => parseFloat(style.getPropertyValue(name)) || 0;

/** Asterisk position within a top-level node: vertical `offset` from the node's
 *  own top (px), coloured by revision `index`. Offsets are layout-relative to
 *  the node, so they're stable as the node moves — only invalidated if the
 *  node's content or the page width changes. */
type NodeLine = { offset: number; index: number };

/** Per-editor cache of {@link NodeLine}s keyed by node identity. ProseMirror
 *  shares node objects for unchanged nodes across edits, so a cache hit means
 *  "this line's geometry can't have changed" — the expensive `getClientRects`
 *  measurement is skipped. Reset when the page width (→ wrapping) changes. */
type LineCache = { map: WeakMap<PMNode, NodeLine[]>; width: number };

/**
 * Compute the asterisk lines for one top-level node, measuring only when it
 * actually carries revision marks. Offsets are relative to the node's top.
 *  - text with the revision mark → one entry per wrapped visual line it covers;
 *  - otherwise an empty/deletion line flagged by the node attribute → a single
 *    entry on the first line.
 * The cheap mark-presence check runs first so the common (unmarked) node returns
 * `[]` without any layout measurement.
 *
 * Returns `null` (rather than `[]`) when a marked node yields no measurable
 * rects — it isn't laid out yet (initial load / fonts not ready / off-screen
 * under `content-visibility`). The caller must NOT cache that, or the stable
 * node identity would pin the empty result forever and the stripe/asterisk
 * would never appear after a refresh (only a content edit would dislodge it).
 *
 * `zoom` is the editor's paint scale (see `renderOverlay`); measured rects are
 * divided by it so the offsets stored here are in unscaled editor coordinates —
 * which also makes them zoom-independent, so the cache survives a rescale.
 */
const computeNodeLines = (
    view: EditorView,
    node: PMNode,
    nodePos: number,
    lineHeight: number,
    zoom: number,
): NodeLine[] | null => {
    let hasMark = false;
    node.descendants((child) => {
        if (hasMark) return false;
        if (child.isText && child.marks.some((m) => m.type.name === REVISION_MARK)) hasMark = true;
        return !hasMark;
    });

    if (!hasMark) {
        const attr = node.attrs.revision;
        if (typeof attr === "number" && attr >= 1) return [{ offset: lineHeight / 2, index: attr }];
        return [];
    }

    const dom = view.nodeDOM(nodePos);
    const nodeTop = dom instanceof HTMLElement ? dom.getBoundingClientRect().top : 0;
    const byLine = new Map<number, number>(); // rounded offset → max revision index
    node.descendants((child, off) => {
        if (!child.isText) return true;
        const mark = child.marks.find((m) => m.type.name === REVISION_MARK);
        if (!mark) return false;
        const index = mark.attrs.index as number;
        const from = view.domAtPos(nodePos + 1 + off);
        const to = view.domAtPos(nodePos + 1 + off + child.nodeSize);
        const range = document.createRange();
        try {
            range.setStart(from.node, from.offset);
            range.setEnd(to.node, to.offset);
        } catch {
            return false;
        }
        const rects = range.getClientRects();
        for (let i = 0; i < rects.length; i++) {
            const r = rects[i];
            if (r.height < 1 || r.width < 0.5) continue;
            const key = Math.round((r.top - nodeTop + r.height / 2) / zoom);
            const cur = byLine.get(key);
            if (cur === undefined || index > cur) byLine.set(key, index);
        }
        return false;
    });
    const out: NodeLine[] = [];
    byLine.forEach((index, offset) => out.push({ offset, index }));
    // Marked but unmeasurable → not laid out yet; signal "don't cache" (see doc).
    return out.length > 0 ? out : null;
};

/**
 * Repaint the revision overlay: one full-height coloured stripe in the left
 * gutter for each changed page, plus a right-margin asterisk on each VISUAL line
 * that contains changed text.
 *
 * Hot-path discipline (this runs on a coalesced rAF while typing):
 *  - Viewport-culled: only top-level nodes on visible pages are visited.
 *  - The page index is tracked incrementally as nodes are walked in document
 *    order — no per-node scan over the (possibly long) break list.
 *  - Per-node line geometry is cached by node identity, so only the node the
 *    keystroke actually changed is re-measured; every other visible line reuses
 *    its cached offsets and needs a single `getBoundingClientRect` for its top.
 *  - Unmarked nodes (the overwhelming majority) cache as `[]` after one cheap
 *    mark check and are then skipped with zero measurement.
 *  - All reads happen before the single `replaceChildren` write (no layout
 *    thrash); page rectangles are pure arithmetic (uniform `pageHeight`).
 */
const renderOverlay = (
    view: EditorView,
    overlay: HTMLElement,
    getDisplayMode: () => RevisionDisplayMode,
    getCurrentRevision: () => number,
    cache: LineCache,
): void => {
    const mode = getDisplayMode();
    if (mode === "hidden") {
        if (overlay.childElementCount) overlay.replaceChildren();
        return;
    }
    // In "current" mode only the active revision's asterisks/stripes are shown.
    const onlyRev = mode === "current" ? getCurrentRevision() : 0;

    const { state } = view;
    const doc = state.doc;
    const dom = view.dom as HTMLElement;
    const style = dom.style;

    const pageHeight = numVar(style, "--page-height");
    const pageGap = numVar(style, "--page-gap");
    const pageWidth = numVar(style, "--page-width");
    const marginRight = numVar(style, "--page-margin-right");
    const marginTop = numVar(style, "--page-margin-top");
    const marginBottom = numVar(style, "--page-margin-bottom");
    const lineHeight = numVar(style, "--line-height") || 16;
    if (!pageHeight || !pageWidth) {
        if (overlay.childElementCount) overlay.replaceChildren();
        return;
    }
    const period = pageHeight + pageGap;

    // Page width drives text wrapping; if it changed, cached line offsets are stale.
    if (cache.width !== pageWidth) {
        cache.map = new WeakMap();
        cache.width = pageWidth;
    }

    const pagination = paginationKey.getState(state) as { breaks?: { pos: number }[] } | undefined;
    const breaks = pagination?.breaks ?? [];
    const totalPages = breaks.length + 1;

    // Visible page window (in editor-content coordinates), padded by one page.
    // Resolve the scroll container here (not at plugin init): EditorContent
    // attaches view.dom to the DOM only after the view is constructed, so a
    // scroller looked up at init would always be null and the window would fall
    // back to whole-window coords.
    const scroller = findScroller(dom);
    const pagRect = dom.getBoundingClientRect();

    // The phone's paged view renders the editor through `transform: scale()`
    // (EditorPanel.module.css) — but only at PAINT time. The overlay's children
    // live inside that same transformed subtree, so their inline top/left are in
    // the editor's UNSCALED coordinates: the very space the page arithmetic below
    // (--page-height & co.) works in. Every rect measured off the DOM, by
    // contrast, comes back already multiplied by the scale. Divide those back out
    // so both sides agree — without this the two coordinate spaces compound, and
    // on a phone the whole overlay drifts to roughly zoom² of its real position
    // while the visible-page window below resolves to pages nowhere near what is
    // actually on screen (so nothing paints at all past the first screenful).
    // `offsetWidth` is a layout metric and ignores transforms, so the ratio is
    // exactly the scale — and exactly 1 on desktop and in endless mode. Falls
    // back to 1 for an unmeasurable editor (hidden panel), which keeps every
    // division below finite; the paint is thrown away in that state anyway.
    const measuredZoom = dom.offsetWidth > 0 ? pagRect.width / dom.offsetWidth : 1;
    const zoom = measuredZoom > 0 ? measuredZoom : 1;
    /** Viewport Y → unscaled editor-content Y. */
    const toEditorY = (clientY: number) => (clientY - pagRect.top) / zoom;

    // Left edge at which the canvas is clipped (the scroll container is
    // `overflow-x: clip`), or the window edge when there is no scroller.
    let clipLeft: number;
    let viewTop: number;
    let viewHeight: number;
    if (scroller) {
        const sRect = scroller.getBoundingClientRect();
        clipLeft = sRect.left;
        viewTop = toEditorY(sRect.top);
        viewHeight = scroller.clientHeight / zoom;
    } else {
        clipLeft = 0;
        viewTop = toEditorY(0);
        viewHeight = window.innerHeight / zoom;
    }
    const visTop = viewTop - period;
    const visBottom = viewTop + viewHeight + period;

    const firstPage = Math.max(0, Math.floor(visTop / period));
    const lastPage = Math.min(totalPages - 1, Math.floor(visBottom / period));
    const fromPos = firstPage === 0 ? 0 : breaks[firstPage - 1].pos;
    const toPos = lastPage >= breaks.length ? doc.content.size : breaks[lastPage].pos;

    const pageMaxRev = new Map<number, number>();
    const asterisks: { top: number; index: number }[] = [];
    // Page a content offset (in editor coords) falls on. Used to attribute each
    // asterisk/stripe to the page it actually lands on rather than to a node's
    // start page — the same arithmetic the pending-edit preview below uses.
    const pageOf = (top: number) => Math.max(0, Math.min(totalPages - 1, Math.floor(top / period)));
    let bp = firstPage; // index of the next break boundary to cross

    doc.nodesBetween(fromPos, Math.max(fromPos, toPos), (node, pos, parent) => {
        if (parent !== doc) return false; // top-level nodes only; don't descend
        while (bp < breaks.length && breaks[bp].pos <= pos) bp++;

        // A node whose own span contains a break is split across two pages by a
        // mid-node sentence-break widget. Its per-line offsets (measured relative
        // to the node top) then include the inter-page gap, so a cache entry taken
        // before it straddled would be stale — placing the far-side asterisk on
        // the wrong page (or outside the content band, where it's dropped). Always
        // measure such a node fresh and never cache it. They exist only at a page
        // boundary and are measured only when actually carrying marks, so the hot
        // path is unaffected.
        //
        // TWO breaks can fall inside the node, and both have to be tested. The
        // obvious one is the next break ahead of it. The other only bites the
        // FIRST node the walk visits: `bp` is seeded from the page arithmetic, so
        // it already points *past* the break the visible window opens on — yet
        // that break's position is `fromPos`, which is exactly what pulls a node
        // straddling it into the walk. Testing `breaks[bp]` alone reads the node
        // as unsplit, so it takes the cache path and stores gap-inclusive offsets;
        // once the break later moves off the node those stale offsets are what get
        // painted, throwing its asterisks a page out and leaving the page they
        // belonged to with no stripe. `breaks[bp - 1]` can only sit after `pos`
        // in that seeded case (the loop above advances past every break at or
        // before `pos`), so the extra test costs one comparison and never
        // false-positives.
        const straddles =
            (bp < breaks.length && breaks[bp].pos < pos + node.nodeSize) || (bp > 0 && breaks[bp - 1].pos > pos);

        let lines = straddles ? undefined : cache.map.get(node);
        if (lines === undefined) {
            const computed = computeNodeLines(view, node, pos, lineHeight, zoom);
            // null = marked node not laid out yet: skip this paint without
            // caching, so a later repaint (fonts-ready / scroll) re-measures it.
            if (computed === null) return false;
            lines = computed;
            if (!straddles) cache.map.set(node, lines);
        }
        if (lines.length === 0) return false;

        const nodeDom = view.nodeDOM(pos);
        const top0 = nodeDom instanceof HTMLElement ? toEditorY(nodeDom.getBoundingClientRect().top) : null;
        if (top0 === null) return false;
        for (const l of lines) {
            if (onlyRev && l.index !== onlyRev) continue; // "current" mode filter
            // Stripe attribution is derived from each line's real landing page in
            // the unified in-band pass below — not from the node's start page.
            asterisks.push({ top: top0 + l.offset, index: l.index });
        }
        return false;
    });

    // Bridge the debounce window: paint asterisks/stripe straight from the
    // plugin's NOT-yet-flushed edits. The "this line changed" signal otherwise
    // lives only in the committed marks written on the debounced flush, so
    // between the keystroke and that flush there's a gap — and if the deleted
    // character was the one holding a previous deletion's anchor, the asterisk
    // disappears until the next flush (a visible blink). The pending set is
    // mapped forward on every transaction and cleared only when the flush lands,
    // so previewing it keeps the asterisk present and steady across the whole
    // window — the same way the live text colour is. Gated on pending edits, so
    // idle renders pay nothing; only the few edited positions are measured, and
    // only within the already-computed visible window.
    const pending = revisionsPluginKey.getState(state);
    if (pending && (pending.del.length > 0 || pending.ins.length > 0)) {
        const rev = getCurrentRevision();
        if (rev >= 1) {
            const size = doc.content.size;
            const clampPos = (p: number) => Math.max(0, Math.min(p, size));
            const addAt = (top: number) => asterisks.push({ top, index: rev });
            // Deletions: one point per change → one asterisk on its visual line.
            for (const point of pending.del) {
                if (point < fromPos || point > toPos) continue;
                const at = clampPos(point);
                // Only a point INSIDE a textblock has a line of its own to mark
                // — the same test the stamp makes. A point BETWEEN blocks (a
                // whole node deleted) has none, and `coordsAtPos` there doesn't
                // fail: it flattens to the neighbouring block's full rect, so
                // previewing it drops an asterisk on that block's vertical
                // centre — a different line from the one the stamp settles on
                // (the emptied neighbour's node attribute, half a line up).
                // Skipping keeps preview and committed paint on the same line.
                //
                // The resolve is on the rAF paint path, never the keypress, and
                // only inside this block — which is gated on there being pending
                // edits at all, i.e. the ~220ms after an edit. Measured on a
                // feature-length doc: 6µs cold / 0.07µs warm, against the 13.5µs
                // `coordsAtPos` below that it gates (and skips outright when it
                // returns false) and the 11µs `nodesBetween` this paint already
                // spends walking the visible window.
                if (!doc.resolve(at).parent.isTextblock) continue;
                try {
                    const c = view.coordsAtPos(at);
                    addAt(toEditorY((c.top + c.bottom) / 2));
                } catch {
                    /* position not laid out yet — skip, retried next paint */
                }
            }
            // Insertions: one asterisk per wrapped visual line the run covers,
            // measured only over the part inside the visible window.
            for (const r of pending.ins) {
                const from = Math.max(clampPos(r.from), fromPos);
                const to = Math.min(clampPos(r.to), toPos);
                if (to <= from) continue;
                try {
                    const a = view.domAtPos(from);
                    const b = view.domAtPos(to);
                    const range = document.createRange();
                    range.setStart(a.node, a.offset);
                    range.setEnd(b.node, b.offset);
                    const rects = range.getClientRects();
                    for (let i = 0; i < rects.length; i++) {
                        const rr = rects[i];
                        if (rr.height < 1 || rr.width < 0.5) continue;
                        addAt(toEditorY(rr.top + rr.height / 2));
                    }
                } catch {
                    /* not laid out yet — skip */
                }
            }
        }
    }

    const children: HTMLElement[] = [];

    // An asterisk marks a changed *content* line, so it must sit inside a page's
    // content area — never in the top/bottom margin or the inter-page gap. The
    // pending-edit preview measures `getClientRects()` over the inserted range,
    // and when an edit (e.g. Enter splitting a node) straddles a page break that
    // range spans from one page's last line, across the break widget, to the
    // next page's first line — yielding stray rects in the previous page's footer
    // and the next page's header. Drop any asterisk whose offset within its page
    // falls outside [marginTop, pageHeight - marginBottom].
    const inContentBand = (top: number): boolean => {
        const off = ((top % period) + period) % period;
        return off >= marginTop && off <= pageHeight - marginBottom;
    };

    // Single pass over all collected asterisks (committed marks + pending
    // preview): keep only those landing in a content band, de-duplicate per
    // visual line (rounded Y), and attribute each page's stripe colour to the
    // lines that actually land on it. Deriving the stripe from the in-band lines'
    // real page — not a node's start page — is what makes a node split across a
    // page break colour BOTH pages' stripes correctly.
    const lineByY = new Map<number, { top: number; index: number }>();
    for (const a of asterisks) {
        if (!inContentBand(a.top)) continue;
        const page = pageOf(a.top);
        if (a.index > (pageMaxRev.get(page) ?? 0)) pageMaxRev.set(page, a.index);
        const key = Math.round(a.top);
        const existing = lineByY.get(key);
        if (!existing || a.index > existing.index) lineByY.set(key, { top: a.top, index: a.index });
    }

    // Stripe geometry. The natural home is the canvas just left of the page, but
    // that space is not always there to use: the phone's paged view fits the page
    // to the viewport (a few px of gutter each side) and the scroller clips
    // horizontally, so a gutter stripe is painted off-screen entirely and a
    // revised page reads as unrevised. Narrow desktop windows pinch the same way.
    // When the canvas can't fit it, tuck the stripe inside the page's own left
    // margin instead — white space well short of the text column. The inside
    // offsets are divided by the zoom so the stripe still paints at the same
    // physical size as it does on desktop rather than shrinking with the page.
    const gutter = (pagRect.left - clipLeft) / zoom;
    const inGutter = gutter >= -STRIPE_LEFT;
    const stripeLeft = inGutter ? STRIPE_LEFT : STRIPE_INSIDE_LEFT / zoom;
    const stripeWidth = inGutter ? STRIPE_WIDTH : STRIPE_WIDTH / zoom;

    // One full-height stripe per changed page (page colour = its max revision).
    for (const [p, maxRev] of pageMaxRev) {
        const color = revisionColor(maxRev);
        if (!color) continue;
        const s = document.createElement("div");
        s.className = "revision-stripe";
        s.style.top = `${p * period}px`;
        s.style.height = `${pageHeight}px`;
        s.style.left = `${stripeLeft}px`;
        s.style.width = `${stripeWidth}px`;
        s.style.background = color;
        children.push(s);
    }

    // Right-margin asterisks.
    const asteriskLeft = pageWidth - marginRight + ASTERISK_INSET;
    for (const { top, index } of lineByY.values()) {
        const color = revisionColor(index);
        if (!color) continue;
        const el = document.createElement("div");
        el.className = "revision-asterisk";
        el.textContent = "*";
        el.style.color = color;
        el.style.top = `${top}px`;
        el.style.left = `${asteriskLeft}px`;
        children.push(el);
    }

    overlay.replaceChildren(...children);
};

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

/**
 * Revisions runtime extension: stamps the changed text of an edit with the
 * current revision mark and paints the gutter stripe + right-margin asterisks
 * via a lightweight overlay.
 *
 * Performance: the overlay is a single, stable widget whose contents are a
 * handful of absolutely-positioned divs, repainted on a coalesced
 * requestAnimationFrame and culled to the viewport — so typing never rebuilds
 * per-line decorations. The pagination measurement loop is untouched, and the
 * attr-only stamp transaction is tagged so pagination skips it (no second
 * measure pass). Every entry point early-exits when revisions are off.
 */
export const createRevisionsExtension = (config: RevisionsConfig) => {
    const { getRevisionsEnabled, getCurrentRevision, getDisplayMode, getBaseline } = config;

    return Extension.create({
        name: "revisions",

        addProseMirrorPlugins() {
            // One stable container, mounted via a single widget decoration. It is
            // always mounted (see `decorations` below) but stays EMPTY while
            // revisions are hidden: no children are built, no frames scheduled and
            // nothing is stamped, so the feature costs a single boolean check per
            // transaction (the editor hot path stays exactly as it was before it).
            const overlay = document.createElement("div");
            overlay.className = "revision-overlay";
            overlay.setAttribute("contenteditable", "false");

            // Memoised so the decoration instance is identical across renders —
            // ProseMirror then keeps the mounted DOM instead of redrawing it.
            const overlayDeco = Decoration.widget(0, () => overlay, {
                key: "revision-overlay",
                side: -1,
                ignoreSelection: true,
            });

            // Per-editor geometry cache (see LineCache); survives across renders.
            const cache: LineCache = { map: new WeakMap(), width: 0 };

            let raf = 0;

            // Memo for the decorations prop. `DecorationSet.create` builds its tree
            // by walking EVERY top-level node (see `buildTree` in prosemirror-view:
            // it iterates the doc's children and rescans the span list for each), so
            // it costs O(document), not O(decorations) — measured at ~1.5µs over 200
            // lines, ~7µs over 1000 and ~17-20µs over 3000 in desktop Chromium, and
            // proportionally worse on the phone's WKWebView.
            //
            // That is paid on EVERY transaction, in every mode, because the overlay
            // widget is returned unconditionally. But the inputs change far less
            // often than the prop is asked: a selection move, a focus change, or any
            // other plugin's no-op transaction all re-ask for an answer identical to
            // the last one. Keying on them collapses that whole class to a pointer
            // compare. A doc change still rebuilds — see the note in `decorations`.
            let memoDoc: PMNode | null = null;
            let memoPending: Pending | null = null;
            let memoKey = "";
            let memoSet: DecorationSet | null = null;

            /**
             * The decoration set for a given state: the always-mounted overlay
             * widget, plus — unless revisions are hidden — inline colour over the
             * still-pending (not-yet-flushed) inserted text.
             *
             * That live colouring is why the pending ranges exist in view state at
             * all: new text shows its revision colour on the keystroke, rather than
             * only once the debounced mark write lands ~220ms later. It adds no
             * document write to the hot path, since continuous typing keeps `ins` at
             * O(1) merged ranges — a handful of decorations over the run being
             * edited. When the flush stamps the real marks it clears pending, so
             * these vanish exactly as the marks (same colour) take over — no flicker.
             */
            const buildDecorations = (
                state: EditorState,
                mode: RevisionDisplayMode,
                rev: number,
                pending: Pending | null,
            ): DecorationSet => {
                const color = mode === "hidden" ? undefined : revisionColor(rev);
                if (!color || !pending || pending.ins.length === 0) {
                    return DecorationSet.create(state.doc, [overlayDeco]);
                }
                const size = state.doc.content.size;
                const style = `color: ${color}`;
                const decos: Decoration[] = [overlayDeco];
                for (const r of pending.ins) {
                    const from = Math.max(0, Math.min(r.from, size));
                    const to = Math.max(0, Math.min(r.to, size));
                    if (to > from) decos.push(Decoration.inline(from, to, { style }));
                }
                return DecorationSet.create(state.doc, decos);
            };

            return [
                new Plugin<Pending>({
                    key: revisionsPluginKey,

                    // Plugin state = the not-yet-applied revision edits. The
                    // keypress only ACCUMULATES here (O(1): map a tiny pending set
                    // forward + record this transaction's changes) — it never
                    // writes to the document. The actual marking happens once on a
                    // debounce (see the view below), keeping the key event free.
                    state: {
                        init: () => EMPTY_PENDING,
                        apply: timeApply("revisions", (tr, value, oldState, newState) => {
                            // Our debounced flush landed → pending is now applied.
                            if (tr.getMeta(REVISION_STAMP_META)) return EMPTY_PENDING;
                            if (!getRevisionsEnabled() || getCurrentRevision() < 1) {
                                return value.dirty ? EMPTY_PENDING : value;
                            }
                            if (!tr.docChanged) return value;

                            // Map existing pending forward so positions stay valid.
                            const ins = value.ins
                                .map((r) => ({ from: tr.mapping.map(r.from, 1), to: tr.mapping.map(r.to, -1) }))
                                .filter((r) => r.to > r.from);
                            const del = value.del.map((p) => tr.mapping.map(p));
                            let lo = value.lo === Infinity ? Infinity : tr.mapping.map(value.lo, -1);
                            let hi = value.hi === -Infinity ? -Infinity : tr.mapping.map(value.hi, 1);

                            // Remote edits (and undo/redo) flow through ySync and
                            // are stamped by their author — keep our pending mapped
                            // forward, but don't record them as local changes.
                            if (tr.getMeta(ySyncPluginKey)) {
                                return { ins: mergeRanges(ins), del, lo, hi, gone: value.gone, dirty: value.dirty };
                            }

                            forEachChange(tr, (from, to) => {
                                if (to > from) ins.push({ from, to });
                                else del.push(from);
                                if (from < lo) lo = from;
                                if (to > hi) hi = to;
                            });

                            // Lines this transaction removed outright. O(1) unless a
                            // block actually disappeared; see {@link goneIds}.
                            let gone = value.gone;
                            if (lo !== Infinity) {
                                const removed = goneIds(tr, oldState.doc, newState.doc, lo, hi);
                                if (removed.length > 0) {
                                    gone = new Set(gone);
                                    for (const id of removed) gone.add(id);
                                }
                            }

                            return {
                                ins: mergeRanges(ins),
                                del: del.length > 8 ? [...new Set(del)] : del,
                                lo,
                                hi,
                                gone,
                                dirty: true,
                            };
                        }),
                    },

                    props: {
                        // The overlay widget stays mounted in EVERY mode, including
                        // "hidden" — there it is simply emptied (see the view's
                        // update below), which costs nothing beyond the single stable
                        // widget every other mode already carries.
                        //
                        // Dropping the decoration instead (returning null) detaches
                        // the overlay with its stripes still inside, and WebKit does
                        // not repaint the area an absolutely-positioned child covered
                        // when the zero-sized parent that holds it is removed — the
                        // stripes sit in the parent's visual overflow, which its own
                        // repaint rect doesn't span. On Safari that left the stripes
                        // painted over every page the viewport had already drawn when
                        // "No revision" was picked, while pages that had never been
                        // painted (the renderer is viewport-culled) correctly showed
                        // none. Removing the stripe elements themselves while the
                        // overlay is still in the document repaints each one normally
                        // — the path scroll culling and the "current" filter already
                        // take on every frame.
                        decorations(state) {
                            const mode = getDisplayMode();
                            const rev = getCurrentRevision();
                            const pending = revisionsPluginKey.getState(state) ?? null;
                            // Everything the answer depends on. `pending` is compared
                            // by identity on purpose: its `apply` returns the SAME
                            // object when a transaction changed nothing it tracks, so
                            // the pointer is exactly the "no new edits" signal.
                            const key = `${mode}:${rev}`;
                            if (memoSet && memoDoc === state.doc && memoPending === pending && memoKey === key) {
                                return memoSet;
                            }
                            const set = buildDecorations(state, mode, rev, pending);
                            memoDoc = state.doc;
                            memoPending = pending;
                            memoKey = key;
                            memoSet = set;
                            return set;
                        },
                    },

                    view(view) {
                        // Tracks the last current-revision we rendered so a pure
                        // "advance" (no doc edit) still repaints; null while hidden.
                        let lastRev: number | null = null;
                        // Last display mode rendered, so a mode switch repaints.
                        let lastMode: RevisionDisplayMode | null = null;
                        // Last (mode, current) the colour vars were set for — only
                        // re-applied when it changes, never per keystroke.
                        let lastVarsKey = "";
                        let flushTimer = 0;

                        const schedule = () => {
                            if (raf) return;
                            raf = requestAnimationFrame(() => {
                                raf = 0;
                                if (!(view as EditorView & { isDestroyed?: boolean }).isDestroyed) {
                                    renderOverlay(view, overlay, getDisplayMode, getCurrentRevision, cache);
                                }
                            });
                        };

                        // Apply accumulated marks in ONE transaction, off the
                        // keypress path. Tagged so pagination skips it and the
                        // plugin state resets.
                        const flush = () => {
                            flushTimer = 0;
                            if ((view as EditorView & { isDestroyed?: boolean }).isDestroyed) return;
                            if (!getRevisionsEnabled()) return;
                            const rev = getCurrentRevision();
                            if (rev < 1) return;
                            const pending = revisionsPluginKey.getState(view.state);
                            if (!pending || !pending.dirty) return;
                            // A flush ALWAYS consumes the pending set — hence the
                            // empty fallback transaction, which carries nothing but
                            // the meta flag that resets the plugin state. Pending
                            // edits with nothing to write are routine: a deletion
                            // whose surviving neighbour is already marked, or one
                            // that empties a line already stamped at this revision
                            // (both `continue` in buildStampTransaction). Dropping
                            // the dispatch there stranded those points in pending
                            // for the rest of the session: mapped forward through
                            // every later transaction, and painted on every frame by
                            // the debounce-bridging preview below — a second,
                            // permanent asterisk beside the committed one on that
                            // line, which cleared only once some later edit on it
                            // finally produced a stampable change.
                            //
                            // Prefer comparing against the baseline captured when
                            // this revision opened; fall back to replaying the edit
                            // events when there is no baseline for it (a project
                            // that predates the feature, or a revision advanced with
                            // no editor open to snapshot it). The fallback can
                            // over-mark — the exact wart the baseline removes — but
                            // it never clears a mark it cannot justify, so an absent
                            // baseline degrades to the previous behaviour rather
                            // than to a wrong one.
                            const baseline = getBaseline?.() ?? null;
                            const tr =
                                (baseline && baseline.index === rev
                                    ? buildDerivedStampTransaction(view.state, pending, rev, baseline)
                                    : buildStampTransaction(view.state, pending, rev)) ?? view.state.tr;
                            view.dispatch(tr.setMeta(REVISION_STAMP_META, true));
                        };
                        const scheduleFlush = () => {
                            if (flushTimer) clearTimeout(flushTimer);
                            flushTimer = window.setTimeout(flush, FLUSH_DELAY);
                        };
                        const cancelFlush = () => {
                            if (flushTimer) {
                                clearTimeout(flushTimer);
                                flushTimer = 0;
                            }
                        };

                        const onUpdate = (v: EditorView, prevState?: EditorState) => {
                            const mode = getDisplayMode();
                            const rev = getCurrentRevision();

                            // DISPLAY: re-tint the committed marks via the per-index
                            // colour vars whenever the mode / current revision
                            // changes (never per keystroke). Marks always stay in
                            // the document — display only governs how they look.
                            const varsKey = mode === "current" ? `current:${rev}` : mode;
                            if (varsKey !== lastVarsKey) {
                                applyColorVars(v.dom as HTMLElement, mode, rev);
                                lastVarsKey = varsKey;
                            }

                            // DISPLAY: the overlay (stripes/asterisks).
                            if (mode === "hidden") {
                                if (overlay.childElementCount) overlay.replaceChildren();
                                lastRev = null;
                            } else {
                                const docChanged = !prevState || v.state.doc !== prevState.doc;
                                const pagChanged =
                                    !prevState || paginationKey.getState(v.state) !== paginationKey.getState(prevState);
                                // Repaint so existing marks track shifting content.
                                // Viewport-culled and node-cached, on a coalesced rAF
                                // — never synchronously on the keypress.
                                //
                                // The pending test comes LAST on purpose: it is only
                                // reached by an update that changed nothing else, so
                                // the typing path (docChanged) short-circuits before
                                // it and pays literally nothing. The overlay previews
                                // the not-yet-flushed pending edits, so it must
                                // repaint when that set changes with no doc change —
                                // a flush that consumes pending without writing
                                // anything (see `flush`) is exactly that case, and
                                // its preview asterisks would otherwise linger until
                                // the next edit or scroll. `prevState` is always set
                                // here (docChanged covers the initial call), and
                                // `getState` is a plain property read on the state.
                                if (
                                    docChanged ||
                                    pagChanged ||
                                    rev !== lastRev ||
                                    mode !== lastMode ||
                                    (!!prevState &&
                                        revisionsPluginKey.getState(v.state) !==
                                            revisionsPluginKey.getState(prevState))
                                ) {
                                    lastRev = rev;
                                    schedule();
                                }
                            }
                            lastMode = mode;

                            // STAMPING (independent of display): debounce the mark
                            // write off the keypress path. Pending only accrues while
                            // stamping is enabled, so this is a no-op otherwise.
                            if (getRevisionsEnabled()) {
                                if (revisionsPluginKey.getState(v.state)?.dirty) scheduleFlush();
                            } else {
                                cancelFlush();
                            }
                        };

                        // Scrolling only changes which stripes/asterisks are
                        // culled in (they live in content coordinates). The editor
                        // scrolls inside an overflow container (not the window), and
                        // scroll events don't bubble — but they DO travel the capture
                        // phase, so a capturing window listener catches that container's
                        // scroll without us having to find the exact element (which
                        // isn't even attached yet at plugin-init time).
                        const onScroll = () => {
                            if (getDisplayMode() !== "hidden") schedule();
                        };
                        window.addEventListener("scroll", onScroll, { capture: true, passive: true });

                        // Repaint when the editor's layout settles or changes size.
                        // The stripes/asterisks are measured from laid-out geometry,
                        // but on a fresh load that geometry isn't final at the first
                        // paints: the document keeps growing as content syncs, the
                        // screenplay font swaps in and pagination settles. Every other
                        // trigger (doc / pagination / mode changes, scroll) can fire
                        // before it's measurable, and once the document is idle nothing
                        // repaints — so the overlay stays blank until an edit or a Show
                        // toggle forces it. Observing the editor box catches the settle
                        // (and later panel/window resizes); our own paint only touches
                        // the zero-size overlay's children, so it can't feed back here.
                        const resizeObserver =
                            typeof ResizeObserver !== "undefined"
                                ? new ResizeObserver(() => {
                                      if (getDisplayMode() !== "hidden") schedule();
                                  })
                                : null;
                        resizeObserver?.observe(view.dom as HTMLElement);

                        onUpdate(view);

                        return {
                            update: onUpdate,
                            destroy: () => {
                                if (raf) cancelAnimationFrame(raf);
                                cancelFlush();
                                window.removeEventListener("scroll", onScroll, { capture: true });
                                resizeObserver?.disconnect();
                            },
                        };
                    },
                }),
            ];
        },
    });
};

/**
 * Force a repaint of the revision overlay. Call when the revisions toggle flips
 * or the current revision advances (colours/visibility change with no doc edit).
 */
export const refreshRevisions = (editor: Editor | null) => {
    if (!editor || !editor.view) return;
    editor.view.dispatch(editor.state.tr.setMeta(REFRESH_META, true));
};
