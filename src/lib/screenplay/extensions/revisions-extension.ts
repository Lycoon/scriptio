import { Editor, Extension, Mark, mergeAttributes } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

import { ScreenplayElement } from "../../utils/enums";
import { REVISION_COLORS, REVISION_STAMP_META, RevisionDisplayMode, revisionColor } from "../revisions";
import { paginationKey } from "./pagination-extension";

const revisionsPluginKey = new PluginKey<Pending>("revisions");
const REFRESH_META = "revisionsRefresh";
/** Mark type name; the inline mark that stamps changed text with its revision index. */
const REVISION_MARK = "revision";
/** Idle delay (ms) before accumulated revision edits are written to the document.
 *  Keeps the per-keystroke path free of the document write; marks appear shortly
 *  after the user pauses. */
const FLUSH_DELAY = 220;

/** Top-level block types that can carry the node-level `revision` attribute. */
const STAMP_TYPES = new Set<string>([
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
    /** Whether anything is waiting to be flushed. */
    dirty: boolean;
};

const EMPTY_PENDING: Pending = { ins: [], del: [], lo: Infinity, hi: -Infinity, dirty: false };

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

// ---------------------------------------------------------------------------
// Overlay rendering
// ---------------------------------------------------------------------------

/** Gutter offset (px) of the stripe to the LEFT of the page, in the canvas. */
const STRIPE_LEFT = -22;
/** Stripe width (px). */
const STRIPE_WIDTH = 5;
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
 */
const computeNodeLines = (view: EditorView, node: PMNode, nodePos: number, lineHeight: number): NodeLine[] | null => {
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
            const key = Math.round(r.top - nodeTop + r.height / 2);
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
    let viewTop: number;
    let viewHeight: number;
    if (scroller) {
        const sRect = scroller.getBoundingClientRect();
        viewTop = sRect.top - pagRect.top;
        viewHeight = scroller.clientHeight;
    } else {
        viewTop = -pagRect.top;
        viewHeight = window.innerHeight;
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

        // A node whose own span contains the next break is split across two pages
        // by a mid-node sentence-break widget. Its per-line offsets (measured
        // relative to the node top) then include the inter-page gap, so a cache
        // entry taken before it straddled would be stale — placing the far-side
        // asterisk on the wrong page (or outside the content band, where it's
        // dropped). Always measure such a node fresh and never cache it. They
        // exist only at a page boundary and are measured only when actually
        // carrying marks, so the hot path is unaffected.
        const straddles = bp < breaks.length && breaks[bp].pos < pos + node.nodeSize;

        let lines = straddles ? undefined : cache.map.get(node);
        if (lines === undefined) {
            const computed = computeNodeLines(view, node, pos, lineHeight);
            // null = marked node not laid out yet: skip this paint without
            // caching, so a later repaint (fonts-ready / scroll) re-measures it.
            if (computed === null) return false;
            lines = computed;
            if (!straddles) cache.map.set(node, lines);
        }
        if (lines.length === 0) return false;

        const nodeDom = view.nodeDOM(pos);
        const top0 = nodeDom instanceof HTMLElement ? nodeDom.getBoundingClientRect().top - pagRect.top : null;
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
                try {
                    const c = view.coordsAtPos(clampPos(point));
                    addAt((c.top + c.bottom) / 2 - pagRect.top);
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
                        addAt(rr.top + rr.height / 2 - pagRect.top);
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

    // One full-height stripe per changed page (page colour = its max revision).
    for (const [p, maxRev] of pageMaxRev) {
        const color = revisionColor(maxRev);
        if (!color) continue;
        const s = document.createElement("div");
        s.className = "revision-stripe";
        s.style.top = `${p * period}px`;
        s.style.height = `${pageHeight}px`;
        s.style.left = `${STRIPE_LEFT}px`;
        s.style.width = `${STRIPE_WIDTH}px`;
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
    const { getRevisionsEnabled, getCurrentRevision, getDisplayMode } = config;

    return Extension.create({
        name: "revisions",

        addProseMirrorPlugins() {
            // One stable container, mounted via a single widget decoration — but
            // ONLY while revisions are enabled. When disabled the plugin adds no
            // decoration, schedules no frames, and stamps nothing, so it costs a
            // single boolean check per transaction (the editor hot path stays
            // exactly as it was before the feature).
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
                        apply(tr, value) {
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
                                return { ins: mergeRanges(ins), del, lo, hi, dirty: value.dirty };
                            }

                            forEachChange(tr, (from, to) => {
                                if (to > from) ins.push({ from, to });
                                else del.push(from);
                                if (from < lo) lo = from;
                                if (to > hi) hi = to;
                            });
                            return {
                                ins: mergeRanges(ins),
                                del: del.length > 8 ? [...new Set(del)] : del,
                                lo,
                                hi,
                                dirty: true,
                            };
                        },
                    },

                    props: {
                        // No decoration at all when display is hidden → ProseMirror
                        // does no extra reconciliation for this plugin on the hot path.
                        decorations(state) {
                            if (getDisplayMode() === "hidden") return null;

                            // Colour the still-pending (not-yet-flushed) inserted
                            // text live, via cheap inline decorations rebuilt from
                            // the same merged `ins` ranges the keystroke already
                            // accumulated — so new text shows its revision colour
                            // *immediately* while typing, instead of only once the
                            // debounced mark write lands. This adds no document
                            // write to the hot path: continuous typing keeps `ins`
                            // at O(1) merged ranges, so this is a handful of
                            // decorations over the run being edited. When the flush
                            // stamps the real marks it clears pending, so these
                            // decorations vanish exactly as the marks (same colour)
                            // take over — no flicker.
                            const pending = revisionsPluginKey.getState(state);
                            if (!pending || pending.ins.length === 0) {
                                return DecorationSet.create(state.doc, [overlayDeco]);
                            }
                            const color = revisionColor(getCurrentRevision());
                            if (!color) return DecorationSet.create(state.doc, [overlayDeco]);

                            const size = state.doc.content.size;
                            const style = `color: ${color}`;
                            const decos: Decoration[] = [overlayDeco];
                            for (const r of pending.ins) {
                                const from = Math.max(0, Math.min(r.from, size));
                                const to = Math.max(0, Math.min(r.to, size));
                                if (to > from) decos.push(Decoration.inline(from, to, { style }));
                            }
                            return DecorationSet.create(state.doc, decos);
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
                            const tr = buildStampTransaction(view.state, pending, rev);
                            if (tr) view.dispatch(tr);
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
                                if (docChanged || pagChanged || rev !== lastRev || mode !== lastMode) {
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
