import { DOMSerializer } from "@node_modules/prosemirror-model/dist";
import { ScreenplayElement } from "@src/lib/utils/enums";
import { Editor, Extension } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

import {
    buildSceneAlphabet,
    compareTokens,
    compileSceneLabel,
    computeSceneLabels,
    SceneLabel,
    SceneToken,
} from "@src/lib/screenplay/scene-locking";
import { PAGE_COLLAPSE_META, PAGE_ONE_KEY, PersistentPageMap, SCENE_OMIT_META } from "@src/lib/screenplay/page-locking";
import { REVISION_COLORS, REVISION_STAMP_META } from "@src/lib/screenplay/revisions";
import { generateNodeId } from "@src/lib/screenplay/nodes";
import { timeApply } from "./apply-timing";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Matches --line-height in scriptio.css. Used for split thresholds. */
const LINE_HEIGHT = 16; // px

/** Minimum freespace (in px) on the current page to even attempt a sentence split.
 *  Below this, it is not worth splitting — just move the whole node to the next page. */
const MIN_SPLIT_FREESPACE = LINE_HEIGHT * 3;

/** Minimum lines the bottom half of a split must have.
 *  If the remainder would be shorter, we force-fit the whole node on the next page instead. */
const MIN_SPLIT_BOTTOM_LINES = 2;

/** Sentence segmenter for straddling splits. Created once at module load. */
const sentenceSegmenter = "Segmenter" in Intl ? new Intl.Segmenter("en", { granularity: "sentence" }) : null;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NodeInfo {
    pos: number;
    type: ScreenplayElement;
    height: number;
    positionTop: number;
    /** data-id of the top-level node, used by page locking to anchor breaks. */
    dataId?: string;
}

interface BreakLogic {
    /** Node must not be the last on a page — pull it to the next page with its following node. */
    keepWithNext: boolean;
    /** Node can be split mid-text at sentence boundaries when straddling a page break. */
    canSplit: boolean;
    /** Minimum node height (px) before attempting a split; 0 means always try. */
    minSplitHeight: number;
    /** Show (MORE) and CHARACTER (CONT'D) labels around the break — true for dialogue splits. */
    showMoreContd: boolean;
}

const BREAK_LOGIC: Partial<Record<ScreenplayElement, BreakLogic>> = {
    // Scene headings and character cues must never be stranded at the bottom of a page.
    [ScreenplayElement.Scene]: { keepWithNext: true, canSplit: false, minSplitHeight: 0, showMoreContd: false },
    [ScreenplayElement.Character]: { keepWithNext: true, canSplit: false, minSplitHeight: 0, showMoreContd: false },
    [ScreenplayElement.Parenthetical]: { keepWithNext: true, canSplit: false, minSplitHeight: 0, showMoreContd: false },
    // Action and Dialogue can straddle pages at sentence boundaries.
    [ScreenplayElement.Action]: {
        keepWithNext: false,
        canSplit: true,
        minSplitHeight: LINE_HEIGHT * 4,
        showMoreContd: false,
    },
    [ScreenplayElement.Dialogue]: { keepWithNext: false, canSplit: true, minSplitHeight: 0, showMoreContd: true },
    // Everything else just moves whole to the next page.
    [ScreenplayElement.Transition]: { keepWithNext: false, canSplit: false, minSplitHeight: 0, showMoreContd: false },
    [ScreenplayElement.Section]: { keepWithNext: false, canSplit: false, minSplitHeight: 0, showMoreContd: false },
    [ScreenplayElement.Note]: { keepWithNext: false, canSplit: false, minSplitHeight: 0, showMoreContd: false },
    [ScreenplayElement.None]: { keepWithNext: false, canSplit: false, minSplitHeight: 0, showMoreContd: false },
    // Dual dialogue is an indivisible block — always moves whole to the next page.
    [ScreenplayElement.DualDialogue]: { keepWithNext: false, canSplit: false, minSplitHeight: 0, showMoreContd: false },
};

export interface PageSize {
    pageHeight: number;
    pageWidth: number;
}

export const PAGE_SIZES: Record<string, PageSize> = {
    LETTER: { pageHeight: 1060, pageWidth: 818 },
    A4: { pageHeight: 1123, pageWidth: 794 },
};

export type PageNumber = number;

export interface HeaderOptions {
    headerLeft: string;
    /** Optional centred column; falls back to the global `headerMiddle`. */
    headerMiddle?: string;
    headerRight: string;
}
export interface FooterOptions {
    footerLeft: string;
    /** Optional centred column; falls back to the global `footerMiddle`. */
    footerMiddle?: string;
    footerRight: string;
}

export interface PaginationOptions {
    pageHeight: number; // full physical page height in px
    pageWidth: number; // full physical page width in px
    pageGap: number; // visual gap between pages in px
    pageGapBorderSize: number;
    pageGapBorderColor: string;
    pageBreakBackground: string;
    marginTop: number; // page margin top in px (space reserved for header + padding)
    marginBottom: number; // page margin bottom in px (space reserved for footer + padding)
    marginLeft: number; // page margin left in px (used for header/footer alignment)
    marginRight: number; // page margin right in px (used for header/footer alignment)
    headerLeft: string;
    headerMiddle: string;
    headerRight: string;
    footerLeft: string;
    footerMiddle: string;
    footerRight: string;
    customHeader: Record<PageNumber, HeaderOptions>;
    customFooter: Record<PageNumber, FooterOptions>;
    /** Element types that force a page break before them. */
    startNewPageTypes: Set<string>;
    /**
     * Production page-lock getters. When the editor is wired with page
     * locking, these expose the live toggle and lock map. Optional so test
     * harnesses and benchmarks can keep their lean Pagination.configure calls.
     */
    getPageLocking?: () => boolean;
    getPageLocks?: () => PersistentPageMap;
    /** Letters skipped from generated labels (shared with scene locking). */
    getSkippedLetters?: () => readonly string[];
    /** Tokens of locked pages that an omitted scene collapsed out of the
     *  document. Rendered as a combined range on the preceding surviving page
     *  (e.g. "4-5") so omitting a full page doesn't leave a gap in the
     *  numbering. Empty/absent when no scene is omitted. */
    getOmittedPages?: () => SceneToken[];
}

export interface PageBreakInfo {
    pos: number; // document position of the break; may be mid-node for sentence splits
    pagenum: number; // page number AFTER this break
    freespace: number; // empty space remaining at the bottom of the ending page's content area
    contdName: string; // non-empty only for dialogue splits: Character cue name for the (CONT'D) label
    splitNodeType: ScreenplayElement | null; // non-null when the break is mid-node (sentence split); drives overlay escape
    /** data-id of the top-level node that begins the page after this break.
     *  Set on every non-synthetic break; used by page locking to detect orphan locks. */
    anchorId?: string;
    /** True for synthetic breaks that represent an entirely empty (orphan-locked) page.
     *  The widget renders the empty content area + the next page's chrome on top of
     *  the normal break chrome. */
    isEmpty?: boolean;
    /** Display label for the page beginning after this break (e.g. "4", "4A").
     *  Equals String(pagenum) when no page-lock is in effect. */
    label?: string;
    /** Display label for the page ending before this break — used by the footer of
     *  the previous page. Undefined for the first break (footer uses page-1 label). */
    prevLabel?: string;
    /** True when the page beginning after this break holds a frozen page-lock
     *  token (status "locked"). Drives the subtle lock badge in the page's
     *  top-right corner. Only ever set while page locking is active. */
    locked?: boolean;
    /** Character offset within the anchor node where the break occurs.
     *  Set for sentence-split breaks (mid-node) — both the original split and
     *  the locked re-application of it — and read by the production panel when
     *  freezing page locks so the split can be reproduced on later recomputes. */
    splitOffset?: number;
    /** True when this break was forced by a node's manual `pageBreak` attribute
     *  (inserted from the editor context menu) rather than by natural overflow.
     *  Drives the "page break" hint rendered in the page gap. */
    manual?: boolean;
}

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        Pagination: {
            updatePageSize: (size: Partial<PageSize>) => ReturnType;
            updatePageHeight: (height: number) => ReturnType;
            updatePageWidth: (width: number) => ReturnType;
            updatePageGap: (gap: number) => ReturnType;
            updateMargins: (margins: { top: number; bottom: number; left: number; right: number }) => ReturnType;
            updateHeaderContent: (left: string, middle: string, right: string, pageNumber?: PageNumber) => ReturnType;
            updateFooterContent: (left: string, middle: string, right: string, pageNumber?: PageNumber) => ReturnType;
            updatePageBreakBackground: (color: string) => ReturnType;
            updateStartNewPageTypes: (types: Set<string>) => ReturnType;
            refreshPagination: () => ReturnType;
            /** Toggle the manual page-break flag on the top-level node at `pos`.
             *  When set, pagination forces a new page that begins with that node. */
            toggleManualPageBreak: (pos: number) => ReturnType;
        };
    }
}

// ---------------------------------------------------------------------------
// Default options
// ---------------------------------------------------------------------------

const defaultOptions: PaginationOptions = {
    pageHeight: 1060,
    pageWidth: 818,
    pageGap: 40,
    pageGapBorderSize: 1,
    pageGapBorderColor: "#e5e5e5",
    pageBreakBackground: "#ffffff",
    marginTop: 96, // 1in
    marginBottom: 96, // 1in
    marginLeft: 144, // 1.5in
    marginRight: 96, // 1in
    headerLeft: "",
    headerMiddle: "",
    headerRight: "",
    footerLeft: "",
    footerMiddle: "",
    footerRight: "{page}",
    customHeader: {},
    customFooter: {},
    startNewPageTypes: new Set<string>(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function syncVars(dom: HTMLElement, o: PaginationOptions) {
    const vars: Record<string, string> = {
        "page-height": `${o.pageHeight}px`,
        "page-width": `${o.pageWidth}px`,
        "page-margin-top": `${o.marginTop}px`,
        "page-margin-bottom": `${o.marginBottom}px`,
        "page-margin-left": `${o.marginLeft}px`,
        "page-margin-right": `${o.marginRight}px`,
        "page-gap": `${o.pageGap}px`,
        "page-gap-border-size": `${o.pageGapBorderSize}px`,
        "page-gap-border-color": o.pageGapBorderColor,
        "page-break-background": o.pageBreakBackground,
    };
    Object.entries(vars).forEach(([k, v]) => dom.style.setProperty(`--${k}`, v));
}

/**
 * Bridge the header/footer templates through the editor DOM, the same way
 * syncVars bridges page geometry. The plugin's `apply` reads `extension.options`,
 * which can lag behind the synchronous mutations a command makes to
 * `this.options` (Tiptap options-object identity issue). Writing the live values
 * onto the DOM in the command and reading them back in `apply` guarantees the
 * recompute sees the just-saved templates — without this, header/footer edits
 * only appear after a full editor rebuild (page refresh).
 */
function syncHeaderFooterData(dom: HTMLElement, o: PaginationOptions) {
    dom.dataset.paginationHeader = JSON.stringify({
        headerLeft: o.headerLeft,
        headerMiddle: o.headerMiddle,
        headerRight: o.headerRight,
        customHeader: o.customHeader,
    });
    dom.dataset.paginationFooter = JSON.stringify({
        footerLeft: o.footerLeft,
        footerMiddle: o.footerMiddle,
        footerRight: o.footerRight,
        customFooter: o.customFooter,
    });
}

// ---------------------------------------------------------------------------
// Decoration builders
// ---------------------------------------------------------------------------

/**
 * Lock badge shown in the top-right corner of a page-locked page.
 *
 * Built once and cloned on reuse — every locked page mounts an identical copy,
 * so the SVG is parsed a single time. CSS floats it just past the page's
 * top-right corner, in the gutter. It carries no text, so the PDF adapter's
 * label extraction (which reads `.pagination-header-right`) and the header-area
 * textContent are both untouched.
 */
let pageLockBadgeTemplate: HTMLSpanElement | null = null;

function makePageLockBadge(): HTMLSpanElement {
    if (!pageLockBadgeTemplate) {
        const badge = document.createElement("span");
        badge.className = "page-lock-badge";
        badge.setAttribute("aria-hidden", "true");
        // Lucide "lock" glyph, matching the icon set used across the app.
        badge.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"' +
            ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"' +
            ' stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>' +
            '<path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
        pageLockBadgeTemplate = badge;
    }
    return pageLockBadgeTemplate.cloneNode(true) as HTMLSpanElement;
}

/**
 * Standalone lock-marker widget for a whole-node locked page.
 *
 * Rendered as its own decoration at the page-start boundary — a sibling of the
 * page-break widget and the page's first paragraph, belonging to neither. It is
 * therefore NOT a descendant of the content-visibility-contained break/first-page
 * widget (whose paint containment would clip it) and NOT tied to the paragraph.
 * A zero-height, full-page-width block establishes the positioning context at
 * the new page's top edge; the badge inside it floats up into the top-right
 * gutter via CSS.
 */
function makePageLockMarker(): HTMLDivElement {
    const marker = document.createElement("div");
    marker.className = "page-lock-marker";
    marker.contentEditable = "false";
    marker.appendChild(makePageLockBadge());
    return marker;
}

/** Append the lock badge to a page's header area when that page is locked. */
function applyPageLock(headerArea: HTMLElement, locked: boolean | undefined): void {
    if (locked) headerArea.appendChild(makePageLockBadge());
}

/**
 * A header/footer span, built once per (class, html) and cloned on reuse.
 *
 * The left/right strings are HTML templates — the default page-number header
 * is e.g. `<p class="page-number" ...>{page}.</p>` — so the content must be
 * parsed as markup (innerHTML), not inserted as literal text. Parsing is the
 * expensive part; a screenplay has only as many distinct strings as it has
 * page labels, so caching the parsed span and `cloneNode`-ing it skips the
 * HTML parse on the per-keystroke widget rebuilds. Bounded so a session that
 * churns through many labels can't grow it without limit.
 */
const areaSpanCache = new Map<string, HTMLSpanElement>();

function makeAreaSpan(className: string, html: string): HTMLSpanElement {
    const key = `${className} ${html}`;
    let tpl = areaSpanCache.get(key);
    if (!tpl) {
        tpl = document.createElement("span");
        tpl.className = className;
        tpl.textContent = html;
        if (areaSpanCache.size > 2000) areaSpanCache.clear();
        areaSpanCache.set(key, tpl);
    }
    return tpl.cloneNode(true) as HTMLSpanElement;
}

function appendAreaSpans(
    area: HTMLElement,
    kind: "header" | "footer",
    left: string,
    middle: string,
    right: string,
): void {
    if (!left && !middle && !right) return;
    area.appendChild(makeAreaSpan(`pagination-${kind}-left`, left));
    area.appendChild(makeAreaSpan(`pagination-${kind}-middle`, middle));
    area.appendChild(makeAreaSpan(`pagination-${kind}-right`, right));
}

/** Today's date as a locale-aware short date (e.g. "6/25/2026"), for `@`. */
const todayShortDate = (): string => new Date().toLocaleDateString();

/**
 * Expand a header template's placeholders for one page:
 *  - `#` -> the page label (number, "4A", or absorbed range like "14-16");
 *  - `@` -> today's date (locale short date);
 *  - `*` -> the page's revision colour name ("Blue", "Pink", ...), or empty when
 *          the page carries no revision (White / base).
 * `{page}` stays supported as a legacy alias for `#`. Empty template -> "".
 */
function expandHeaderTemplate(tpl: string, label: string, revision: number): string {
    if (!tpl) return "";
    let out = tpl;
    if (out.includes("{page}")) out = out.split("{page}").join(label);
    if (out.includes("#")) out = out.split("#").join(label);
    if (out.includes("@")) out = out.split("@").join(todayShortDate());
    if (out.includes("*")) {
        const name = revision >= 1 && revision < REVISION_COLORS.length ? REVISION_COLORS[revision].name : "";
        out = out.split("*").join(name);
    }
    return out;
}

/** Whether any header template (global or per-page) uses the `*` revision
 *  placeholder. Gates the per-page revision scan so the common case pays nothing. */
function headerUsesRevision(options: PaginationOptions): boolean {
    const has = (s: string | undefined) => !!s && s.includes("*");
    if (has(options.headerLeft) || has(options.headerMiddle) || has(options.headerRight)) return true;
    for (const k in options.customHeader) {
        const c = options.customHeader[k];
        if (has(c.headerLeft) || has(c.headerMiddle) || has(c.headerRight)) return true;
    }
    return false;
}

/**
 * Highest revision index appearing on any top-level node, including its inline
 * `revision` marks (changed text) and its `revision` node attribute (empty /
 * deleted lines). 0 when the node carries no revision.
 */
function nodeMaxRevision(node: Node): number {
    let max = typeof node.attrs.revision === "number" ? node.attrs.revision : 0;
    node.descendants((child) => {
        if (child.isText) {
            for (const m of child.marks) {
                if (m.type.name === "revision") {
                    const idx = m.attrs.index as number;
                    if (idx > max) max = idx;
                }
            }
        }
        return true;
    });
    return max;
}

/**
 * Max revision index per page (index 0 = page 1), used to expand the `*` header
 * placeholder. Walks top-level nodes once, advancing the page counter as each
 * break position is crossed — the same incremental scheme the revision overlay
 * uses. Only called when a header template actually uses `*`.
 */
function computePageRevisions(doc: Node, breaks: PageBreakInfo[]): number[] {
    const pageRev: number[] = [0];
    let page = 0;
    let bp = 0;
    doc.forEach((node, offset) => {
        while (bp < breaks.length && breaks[bp].pos <= offset) {
            page++;
            bp++;
            if (pageRev[page] === undefined) pageRev[page] = 0;
        }
        const r = nodeMaxRevision(node);
        if (r > (pageRev[page] ?? 0)) pageRev[page] = r;
    });
    return pageRev;
}

function fillHeader(
    area: HTMLElement,
    pagenum: number,
    label: string,
    options: PaginationOptions,
    revision: number,
): void {
    const custom = options.customHeader[pagenum];
    const left = expandHeaderTemplate(custom?.headerLeft ?? options.headerLeft, label, revision);
    const middle = expandHeaderTemplate(custom?.headerMiddle ?? options.headerMiddle, label, revision);
    const right = expandHeaderTemplate(custom?.headerRight ?? options.headerRight, label, revision);
    appendAreaSpans(area, "header", left, middle, right);
}

function fillFooter(area: HTMLElement, pagenum: number, label: string, options: PaginationOptions): void {
    const custom = options.customFooter[pagenum];
    const left = expandHeaderTemplate(custom?.footerLeft ?? options.footerLeft, label, 0);
    const middle = expandHeaderTemplate(custom?.footerMiddle ?? options.footerMiddle, label, 0);
    const right = expandHeaderTemplate(custom?.footerRight ?? options.footerRight, label, 0);
    appendAreaSpans(area, "footer", left, middle, right);
}

/**
 * Let offscreen widgets skip style recalculation and layout entirely.
 *
 * A mid-document edit shifts every following page boundary, so ProseMirror
 * relocates (recreates) every downstream break widget — content-visibility
 * keeps the browser from doing rendering work for the ones outside the
 * viewport, which is almost all of them. The exact intrinsic height keeps
 * in-flow geometry (and the PDF adapter's measurements) identical while
 * skipped.
 *
 * NOT applied to mid-node split widgets: their overlay escapes the container
 * box via negative offsets, and the paint containment implied by
 * content-visibility would clip it.
 */
function containOffscreen(container: HTMLElement, intrinsicHeight: number): void {
    container.style.setProperty("content-visibility", "auto");
    container.style.setProperty("contain-intrinsic-size", `none ${intrinsicHeight}px`);
}

function createFirstPageWidget(firstPageLabel: string, options: PaginationOptions, revision: number): HTMLElement {
    const container = document.createElement("div");
    container.className = "pagination-first-page";
    container.contentEditable = "false";

    const spacer = document.createElement("div");
    spacer.className = "pagination-spacer";
    spacer.style.height = `${options.marginTop}px`;

    const overlay = document.createElement("div");
    overlay.className = "pagination-overlay";
    overlay.style.top = "0";
    overlay.style.height = `${options.marginTop}px`;

    const headerArea = document.createElement("div");
    headerArea.className = "pagination-header-area";
    headerArea.style.height = `${options.marginTop}px`;
    fillHeader(headerArea, 1, firstPageLabel, options, revision);
    // Page 1's lock badge is mounted on its first paragraph (see
    // pushPageLockBadge) — not here — because this widget carries
    // content-visibility, whose paint containment would hide it.

    overlay.appendChild(headerArea);
    container.appendChild(spacer);
    container.appendChild(overlay);
    containOffscreen(container, options.marginTop);
    return container;
}

/**
 * Returns the CSS variable names for the left and right padding of a split node type.
 * Used to compute the negative offsets needed to make the overlay escape the parent
 * <p> element's content area and span the full page width.
 */
function getSplitPaddingVars(nodeType: ScreenplayElement): [string, string] {
    // Screenplay elements now use element-specific margin variables (e.g., --action-l-margin)
    // rather than a global page margin.
    return [`var(--${nodeType}-l-margin)`, `var(--${nodeType}-r-margin)`];
}

/**
 * Static skeleton for the page-break widget, built once and cloned per use.
 *
 * createPageBreakWidget runs for every break that changes on a keystroke, and
 * the profiler showed its `createElement`/`appendChild` calls adding up. The
 * structure (container › spacer + overlay › footer + divider + header) is
 * identical for every break — only heights and label text differ — so the
 * tree is assembled once here and a single native `cloneNode(true)` replaces
 * the ~10 element-creation calls. Only the static styling lives on the
 * skeleton; per-break heights/content are patched onto the clone.
 *
 * Clone layout (indices are stable — optional empty/contd nodes are appended
 * after, so they never shift these):
 *   clone.children[0]            = spacer
 *   clone.children[1]            = overlay
 *   overlay.children[0/1/2]      = footer / divider / header
 */
let pageBreakSkeleton: HTMLDivElement | null = null;

function getPageBreakSkeleton(): HTMLDivElement {
    if (pageBreakSkeleton) return pageBreakSkeleton;

    const container = document.createElement("div");
    container.className = "pagination-page-break";
    container.contentEditable = "false";

    const spacer = document.createElement("div");
    spacer.className = "pagination-spacer";

    const overlay = document.createElement("div");
    overlay.className = "pagination-overlay";
    overlay.style.top = "0";

    const footerArea = document.createElement("div");
    footerArea.className = "pagination-footer-area";

    const divider = document.createElement("div");
    divider.className = "pagination-divider";
    divider.style.backgroundColor = "var(--main-bg)";

    const headerArea = document.createElement("div");
    headerArea.className = "pagination-header-area";

    overlay.appendChild(footerArea);
    overlay.appendChild(divider);
    overlay.appendChild(headerArea);
    container.appendChild(spacer);
    container.appendChild(overlay);

    pageBreakSkeleton = container;
    return container;
}

function createPageBreakWidget(breakInfo: PageBreakInfo, options: PaginationOptions, revision: number): HTMLElement {
    const container = getPageBreakSkeleton().cloneNode(true) as HTMLDivElement;
    const spacer = container.children[0] as HTMLElement;
    const overlay = container.children[1] as HTMLElement;
    const footerArea = overlay.children[0] as HTMLElement;
    const divider = overlay.children[1] as HTMLElement;
    const headerArea = overlay.children[2] as HTMLElement;

    const contentHeight = options.pageHeight - options.marginTop - options.marginBottom;
    const isEmpty = !!breakInfo.isEmpty;

    // Empty (orphan-locked) pages append `contentHeight` worth of blank
    // content to the normal break chrome — the prev→empty transition is
    // rendered here (footer of prev, gap, header of the empty page, then
    // the empty content area). The empty→next transition is handled by
    // the break that follows this one in the breaks array (a lock force-
    // break, or a subsequent orphan synthetic, or the last-page widget).
    // Splitting it this way keeps each page transition rendered exactly
    // once and lets the synthetic absorb the previous page's freespace.
    const emptyPageExtension = isEmpty ? contentHeight : 0;

    // Spacer: pushes text in the document flow past the entire page boundary.
    // Includes freespace because the spacer is the only thing that moves text.
    const spacerHeight =
        breakInfo.freespace + options.marginBottom + options.pageGap + options.marginTop + emptyPageExtension;
    spacer.style.height = `${spacerHeight}px`;

    // Overlay: sits on top of the spacer (top:0, same height).
    // Uses flex justify-content:flex-end so footer/divider/header are pushed to the bottom.
    // The remaining space at the top is the freespace zone, covered by the overlay's background.
    overlay.style.height = `${spacerHeight}px`;

    // For mid-node splits, the widget is inserted inside a padded <p> element.
    // The overlay's position:absolute is relative to the container, which is bounded
    // by the <p>'s content area — so left:0/right:0 only reaches the text column edges,
    // not the page edges. We escape the parent padding by negating it with the same CSS
    // variables that define the node type's padding, restoring full-page coverage.
    if (breakInfo.splitNodeType !== null) {
        const [leftVar, rightVar] = getSplitPaddingVars(breakInfo.splitNodeType);
        // Multiply by --display-margin-scale so the escape tracks the parent <p>'s
        // padding, which is itself scaled (calc(var(--x-margin) * scale)). On desktop
        // the scale is 1, so this is identical to negating the raw padding; on the
        // phone reading layout it keeps the header/footer band aligned to the page.
        overlay.style.left = `calc(-1 * ${leftVar} * var(--display-margin-scale))`;
        overlay.style.right = `calc(-1 * ${rightVar} * var(--display-margin-scale))`;
    }

    // Labels for the surrounding pages. Defaults preserve legacy behavior
    // (pagenum-1 / pagenum) when no labels were assigned (page locking off).
    const prevLabel = breakInfo.prevLabel ?? String(breakInfo.pagenum - 1);
    const thisLabel = breakInfo.label ?? String(breakInfo.pagenum);

    // Footer area of the ending page (fixed size = marginBottom)
    footerArea.style.height = `${options.marginBottom}px`;
    fillFooter(footerArea, breakInfo.pagenum - 1, prevLabel, options);

    // Visual gap between pages (fixed size = pageGap)
    divider.style.height = `${options.pageGap}px`;

    // Manual page break: hint the user that this boundary was forced from the
    // context menu (vs a natural overflow break). Rather than a faint mark
    // buried in the inter-page gap (easy to miss), the affordance is a line
    // spanning the full page width at the very top of the new page, sitting just
    // above the first line of the node that begins the page. The overlay's
    // bottom edge aligns with the page's content-top (the node's top), so
    // anchoring the marker there (CSS bottom:0) places it exactly at the node's
    // top. Absolute positioning keeps it out of the overlay's flex flow, so it
    // never disturbs the footer/divider/header layout.
    if (breakInfo.manual) {
        container.classList.add("pagination-manual-break");
        const marker = document.createElement("div");
        marker.className = "pagination-manual-break-marker";
        const line = document.createElement("div");
        line.className = "pagination-manual-break-line";
        marker.appendChild(line);
        overlay.appendChild(marker);
    }

    // Header area of the new page (fixed size = marginTop)
    headerArea.style.height = `${options.marginTop}px`;
    fillHeader(headerArea, breakInfo.pagenum, thisLabel, options, revision);
    // Only mid-node split pages render the lock badge in the header area: their
    // widget is exempt from content-visibility (its overlay escapes the box), so
    // the badge actually paints. Whole-node pages would have it clipped by this
    // widget's paint containment, so they mount it on the page's first paragraph
    // instead (see pushPageLockBadge).
    if (breakInfo.splitNodeType !== null) applyPageLock(headerArea, breakInfo.locked);

    if (isEmpty) {
        // Empty content area for the orphan-locked page. Renders a faint
        // label centred in the page so the user can see which locked
        // number is being preserved. The empty→next transition (footer of
        // this empty page, gap, header of the next page) is rendered by
        // the break that follows this synthetic in the breaks array.
        const emptyArea = document.createElement("div");
        emptyArea.className = "pagination-empty-page";
        emptyArea.style.height = `${contentHeight}px`;
        emptyArea.textContent = thisLabel;
        overlay.appendChild(emptyArea);
    }

    // For dialogue/parenthetical splits: add (MORE) at the end of the current page
    // and CHARACTER (CONT'D) at the top of the next page.
    // Both are position:absolute inside the overlay so they don't affect flow layout.
    if (breakInfo.contdName) {
        // (MORE) — centred at the dialogue column, one line above the footer area.
        // CSS: bottom: calc(100% - 1lh) positions it just after the last content line on page N.
        // Label text comes from the --more-label CSS variable via ::after.
        const moreEl = document.createElement("div");
        moreEl.className = "page-more-overlay";
        overlay.appendChild(moreEl);

        // CHARACTER (CONT'D) — left-aligned at the character column, one line before the new content.
        // CSS: top: calc(100% - 1lh) positions it just before the first content line on page N+1.
        // textContent holds the character name; the label comes from --contd-label via ::after.
        const contdEl = document.createElement("div");
        contdEl.className = "page-contd-overlay";
        contdEl.textContent = breakInfo.contdName;
        overlay.appendChild(contdEl);
    }

    // spacer + overlay are already in the cloned skeleton; nothing to append.
    // Split widgets must keep full rendering: their overlay escapes the
    // container box, which content-visibility's paint containment would clip.
    if (breakInfo.splitNodeType === null) {
        containOffscreen(container, spacerHeight);
    }
    return container;
}

function createLastPageWidget(
    pagenum: number,
    label: string,
    freespace: number,
    options: PaginationOptions,
): HTMLElement {
    const container = document.createElement("div");
    container.className = "pagination-last-page";
    container.contentEditable = "false";

    const spacerHeight = freespace + options.marginBottom;
    const spacer = document.createElement("div");
    spacer.className = "pagination-spacer";
    spacer.style.height = `${spacerHeight}px`;

    const overlay = document.createElement("div");
    overlay.className = "pagination-overlay";
    overlay.style.top = "0";
    overlay.style.height = `${spacerHeight}px`;

    const footerArea = document.createElement("div");
    footerArea.className = "pagination-footer-area";
    footerArea.style.height = `${options.marginBottom}px`;
    fillFooter(footerArea, pagenum, label, options);

    overlay.appendChild(footerArea);
    container.appendChild(spacer);
    container.appendChild(overlay);
    containOffscreen(container, spacerHeight);
    return container;
}

/**
 * Compact fingerprint of every option value baked into the widget DOM
 * (spacer heights, header/footer markup). Appended to each widget key so
 * an option change re-keys the widgets and forces a redraw — required now
 * that widgets are constructed lazily and a matching key keeps the old DOM.
 */
function widgetOptionsFingerprint(options: PaginationOptions): string {
    const src =
        `${options.pageHeight}|${options.pageGap}|${options.marginTop}|${options.marginBottom}|` +
        `${options.headerLeft}|${options.headerMiddle}|${options.headerRight}|${options.footerLeft}|${options.footerMiddle}|${options.footerRight}|` +
        `${JSON.stringify(options.customHeader)}|${JSON.stringify(options.customFooter)}`;
    // djb2 — collisions are vanishingly unlikely across the handful of option
    // states a session sees, and a false match only delays a redraw until the
    // next forced update.
    let hash = 5381;
    for (let i = 0; i < src.length; i++) hash = ((hash << 5) + hash + src.charCodeAt(i)) | 0;
    return (hash >>> 0).toString(36);
}

/**
 * Index the previous decoration set by `pos:key` so a rebuild can reuse the
 * *exact same* Decoration instance for any widget that hasn't changed.
 *
 * This is the single most important optimization on the typing hot path. A
 * mid-document edit shifts the last page's freespace, which forces a full
 * rebuild even though all but a couple of widgets are untouched. ProseMirror's
 * view diffing only keeps a widget's mounted DOM in place when it sees the
 * *same Decoration object* across updates — a freshly built `Decoration.widget`
 * with a matching key is still torn down and re-inserted when the surrounding
 * content is dirty. Re-inserting ~95 widget subtrees into the editor's flat
 * sibling list is what drives the document-wide "Recalculate Style" (the
 * pagination `apply` itself is only ~1.7 ms; the view update is ~25 ms).
 *
 * By handing back the previous instance for unchanged widgets, only the
 * handful that genuinely changed (typically just the last-page widget) get
 * recreated, and the rest keep their DOM untouched — no style invalidation.
 */
function buildReuseMap(mapped: DecorationSet): Map<string, Decoration> {
    const reuse = new Map<string, Decoration>();
    for (const d of mapped.find()) {
        const key = d.spec.key as string | undefined;
        if (key) reuse.set(`${d.from}:${key}`, d);
    }
    return reuse;
}

function buildDecorations(
    doc: Node,
    breaks: PageBreakInfo[],
    lastPageFreespace: number,
    firstPageLabel: string,
    firstPageLocked: boolean,
    options: PaginationOptions,
    pageRevisions: number[],
    reuse?: Map<string, Decoration>,
): DecorationSet {
    const decorations: Decoration[] = [];
    const fp = widgetOptionsFingerprint(options);

    // Push a widget, reusing the previous Decoration instance when one exists at
    // the same position with the same key (see buildReuseMap). Reusing the
    // instance is what lets ProseMirror keep the mounted DOM in place instead of
    // recreating the subtree. Widget DOM is also built LAZILY (toDOM closure,
    // not an eager node): the closure only runs for widgets actually drawn, and
    // a function has no `parentNode`, which is the other condition prosemirror's
    // placeWidget needs to reuse DOM across differing instances.
    const pushWidget = (pos: number, key: string, side: number, build: () => HTMLElement) => {
        const existing = reuse?.get(`${pos}:${key}`);
        decorations.push(existing ?? Decoration.widget(pos, build, { side, key }));
    };

    // Mark the first in-flow node of a page so its top margin can be zeroed.
    //
    // This replaces the CSS adjacent-sibling rules `.pagination-page-break + p`
    // / `.pagination-first-page + p`. Those combinators are a per-keystroke
    // performance trap: the editor is a *flat* list of thousands of sibling
    // <p>/widget elements, and inserting or moving any element forces Blink to
    // re-evaluate the `+ p` match across a long run of siblings — invalidating
    // the style of the entire tail of the document (the ~3.4k-element
    // "Recalculate Style" seen while typing). A plain class selector carries no
    // sibling dependency, so only the handful of nodes whose first-of-page
    // status actually changed get restyled.
    const markPageStart = (pos: number, cls: string, pageLabel?: string) => {
        const node = doc.resolve(pos).nodeAfter;
        if (!node) return;
        // pageLabel drives the phone-only slim "Page N" divider rendered via CSS
        // ::before on the page's first node (see the max-width:767px block in
        // scriptio.css). It is a plain DOM attribute on the node decoration, so it
        // never reaches the offscreen measurement div — page counts stay canonical.
        const attrs: Record<string, string> = { class: cls };
        if (pageLabel != null) attrs["data-page-label"] = pageLabel;
        decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs));
    };

    // Mount the lock badge for a locked, whole-node page as its own standalone
    // widget at the page-start boundary. It must live OUTSIDE the page-break /
    // first-page widget — those carry content-visibility, whose paint containment
    // hides anything inside them. A sibling widget in the flat list is a direct
    // child of `.pagination` (not contained), so it paints into the gutter. Side
    // +1 keeps it after the page-break widget at the same position, i.e. on the
    // new page's side of the boundary. Mid-node split pages can't use this (their
    // page has no fresh boundary node), but their break widget is
    // content-visibility-exempt, so they keep the header-area badge instead.
    const pushPageLockBadge = (pos: number) => {
        pushWidget(pos, "page-lock-marker", 1, makePageLockMarker);
    };

    // First page top margin / header
    const firstPageRev = pageRevisions[0] ?? 0;
    pushWidget(0, `page-1-header-${firstPageLabel}-${firstPageRev}-${fp}`, -1, () =>
        createFirstPageWidget(firstPageLabel, options, firstPageRev),
    );
    markPageStart(0, "pagination-doc-start");
    if (firstPageLocked) pushPageLockBadge(0);

    // Page breaks
    // The key MUST include every value that affects the widget DOM (freespace,
    // contdName, splitNodeType, label, isEmpty, options fingerprint) — not just
    // pagenum. A matching key keeps the previously drawn DOM, so a key that
    // omits e.g. freespace causes stale spacer heights after content edits.
    for (const b of breaks) {
        const bRev = pageRevisions[b.pagenum - 1] ?? 0;
        const key = `pb-${b.pagenum}-${b.freespace}-${b.contdName}-${b.splitNodeType}-${b.label ?? ""}-${b.prevLabel ?? ""}-${b.isEmpty ? "E" : ""}-${b.locked ? "L" : ""}-${b.manual ? "M" : ""}-${bRev}-${fp}`;
        pushWidget(b.pos, key, -1, () => createPageBreakWidget(b, options, bRev));
        // Only whole-node breaks start a fresh node; mid-node sentence splits
        // (splitNodeType !== null) keep the straddling node, which never had a
        // margin to reset — the old `> .pagination-page-break + p` rule didn't
        // match inside-<p> widgets either.
        if (b.splitNodeType === null) {
            markPageStart(b.pos, "pagination-break-start", b.label ?? String(b.pagenum));
            // Whole-node locked page → mount its badge on the new page's first
            // paragraph (split locked pages render it in the header area above).
            if (b.locked) pushPageLockBadge(b.pos);
        }
    }

    // Last page bottom margin / footer.
    // Label of the last page = label of the most recent break (or firstPageLabel
    // when no breaks exist).
    const lastPagenum = breaks.length > 0 ? breaks[breaks.length - 1].pagenum : 1;
    const lastPageLabel = breaks.length > 0 ? (breaks[breaks.length - 1].label ?? String(lastPagenum)) : firstPageLabel;
    pushWidget(doc.content.size, `lp-${lastPagenum}-${lastPageLabel}-${lastPageFreespace}-${fp}`, 1, () =>
        createLastPageWidget(lastPagenum, lastPageLabel, lastPageFreespace, options),
    );

    return DecorationSet.create(doc, decorations);
}

// ---------------------------------------------------------------------------
// Height measurement
// ---------------------------------------------------------------------------

const heightCache = new Map<string, number>();

const getHTMLHeight = (
    domNode: HTMLElement,
    editorDom: HTMLElement,
    nodeType: string,
    options: PaginationOptions,
    contentSize?: number,
): number => {
    const textContent = domNode.textContent || "";
    const sizePart = contentSize != null ? `${contentSize}:` : "";
    const cacheKey = `${nodeType}:${options.pageWidth}:${options.marginLeft}:${options.marginRight}:${sizePart}${textContent}`;

    if (heightCache.has(cacheKey)) {
        return heightCache.get(cacheKey)!;
    }

    const testDiv = setupTestDiv(editorDom, options);
    testDiv.innerHTML = domNode.outerHTML;

    const rect = testDiv.getBoundingClientRect();
    const height = Math.round(rect.height);

    if (heightCache.size > 10000) heightCache.clear();
    heightCache.set(cacheKey, height);

    return height;
};

/** Element types whose screenplay CSS collapses the top margin to 0
 *  (`.dialogue` / `.parenthetical` set `margin-top: 0`; `.dual_dialogue` is a
 *  flex container with no margin). Every other element inherits the `> p`
 *  rule `margin-top: var(--line-height)`. */
const ZERO_TOP_MARGIN_TYPES = new Set<ScreenplayElement>([
    ScreenplayElement.Dialogue,
    ScreenplayElement.Parenthetical,
    ScreenplayElement.DualDialogue,
]);

/**
 * Top margin (px) the screenplay CSS gives a node type.
 *
 * This is the amount the `.pagination-doc-start` / `.pagination-break-start`
 * rule strips from the first node of each page (so text starts flush at the top
 * of the content area), and the amount a straddling node's continuation lacks
 * (the continuation is mid-node and has no top margin). The height accounting
 * measures every node WITH its margin, so callers subtract this where the margin
 * is not actually rendered — keeping each page a constant height.
 *
 * Margins are a fixed binary in the live editor: 0 for the types above, else
 * LINE_HEIGHT (which already mirrors the fixed `--line-height: 16px`). The
 * `scene-heading-spacing-*` multipliers live only in the print CSS and are never
 * applied to the editor DOM, so there is no per-instance variation to measure —
 * a constant keeps this off the layout path entirely, the same way LINE_HEIGHT
 * mirrors --line-height. Keep in sync with the margin-top rules in scriptio.css.
 */
const nodeTopMargin = (nodeType: ScreenplayElement): number => (ZERO_TOP_MARGIN_TYPES.has(nodeType) ? 0 : LINE_HEIGHT);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const setupTestDiv = (editorDom: HTMLElement, _: PaginationOptions): HTMLElement => {
    let testDiv = document.getElementById("pagination-test-div");
    if (!testDiv) {
        testDiv = document.createElement("div");
        testDiv.id = "pagination-test-div";
        testDiv.className = "ProseMirror pagination";
        testDiv.style.position = "fixed";
        testDiv.style.top = "0";
        testDiv.style.left = "-9999px";
        testDiv.style.pointerEvents = "none";
        testDiv.style.whiteSpace = "break-spaces";
        testDiv.style.visibility = "hidden";

        // position:fixed already establishes a block formatting context which
        // prevents margin collapsing.  Using overflow:hidden as a belt-and-
        // suspenders safeguard avoids the 2 px measurement error that the old
        // 1 px transparent borders used to introduce on every height reading.
        testDiv.style.overflow = "hidden";
        // The .pagination class sets min-height: var(--page-height) for the editor,
        // but the test div must shrink to fit each node's content.
        testDiv.style.minHeight = "0";

        document.body.appendChild(testDiv);
    }

    // Sync classes and CSS variables that affect layout from editor to test div.
    // testDiv lives in <body>, not inside the editor, so it doesn't inherit the editor's CSS vars.
    testDiv.className = editorDom.className;

    // Copy all CSS variables from the live editor DOM to the test div. This includes
    // both element margin/style vars (set by DocumentEditorPanel) and page dimension
    // vars (set by syncVars inside each command before the transaction is dispatched).
    // Reading from editorDom rather than from options avoids the stale-options problem:
    // extension.options in apply() may lag behind the mutation done by the command.
    for (let i = 0; i < editorDom.style.length; i++) {
        const prop = editorDom.style[i];
        if (prop.startsWith("--")) {
            testDiv.style.setProperty(prop, editorDom.style.getPropertyValue(prop));
        }
    }

    // Remove the pagination class whose `width: var(--page-width) !important` rule
    // would fight our explicit width, then set the width directly from the value that
    // syncVars already wrote to editorDom (guaranteed current for this transaction).
    testDiv.classList.remove("pagination");
    testDiv.style.width = editorDom.style.getPropertyValue("--page-width");

    return testDiv;
};

// ---------------------------------------------------------------------------
// Sentence splitting
// ---------------------------------------------------------------------------

interface SplitResult {
    /** Absolute document position of the split point (inside the straddling node's text). */
    pos: number;
    /** Character offset within the node's text where the split occurs (= pos - nodeDocPos - 1). */
    offset: number;
    /** Rendered height of the portion staying on the current page. */
    topHeight: number;
    /** Rendered height of the portion continuing on the next page, excluding the
     *  node's top margin (the continuation is mid-node and has no top margin). */
    bottomHeight: number;
}

/**
 * Attempts to split a straddling Action or Dialogue node at a sentence boundary.
 *
 * Strategy: use Intl.Segmenter to break the node's text into sentences, then find the
 * longest sentence prefix whose rendered height fits within `freespace`. If the remaining
 * bottom portion would be shorter than MIN_SPLIT_BOTTOM_LINES, the split is rejected and
 * the whole node moves to the next page (same as the legacy behaviour).
 *
 * Height is measured using plain textContent (no inline marks) which is accurate for
 * monospace fonts where bold/italic do not change character widths.
 *
 * Returns null when no valid split exists.
 */
function trySplitNode(
    node: Node,
    nodeDocPos: number,
    nodeMarginTop: number,
    freespace: number,
    nodeElement: HTMLElement,
    editorDOM: HTMLElement,
    options: PaginationOptions,
): SplitResult | null {
    if (!sentenceSegmenter) return null;

    const text = node.textContent as string;
    const sentences = Array.from(sentenceSegmenter.segment(text), (s: Intl.SegmentData) => s.segment);

    // A single sentence cannot be split at a boundary — move the whole node.
    if (sentences.length <= 1) return null;

    // Try progressively shorter prefixes (all-but-last, all-but-last-two, …)
    // until one fits in the available freespace.
    for (let i = sentences.length - 2; i >= 0; i--) {
        const topText = sentences.slice(0, i + 1).join("");

        // Measure the top half: clone the element (preserving tag + CSS class) with only the top text.
        // Using textContent instead of innerHTML is intentional — for a monospace font, inline marks
        // (bold, italic) do not change character widths, so the line count is the same.
        const topElement = nodeElement.cloneNode(false) as HTMLElement;
        topElement.textContent = topText;
        const topHeight = getHTMLHeight(topElement, editorDOM, node.type.name, options);

        if (topHeight <= freespace) {
            // Height of the bottom half as it actually renders on the next page.
            //
            // The split is drawn as a single <p> with a block break widget inserted
            // mid-node. That widget forces the bottom text onto a fresh line, so the
            // continuation wraps *independently* of the top half — exactly like a
            // standalone clone of the bottom text. We therefore measure it that way
            // and then strip the one thing the standalone clone gets wrong: the
            // node type's top margin (16px for Action's `.action`, 0 for Dialogue's
            // `.dialogue`), which the continuation does not have because it is
            // mid-node.
            //
            // Deriving it as (nodeHeight - topHeight) instead is only correct when
            // the sentence boundary lands at a line boundary. When it falls mid-line
            // the full node flows continuously (all_lines < top_lines + bottom_lines),
            // so that formula underestimates the fresh-wrapped continuation by a line
            // and the next page expands ~16px — the residual bug this measurement fixes.
            const bottomText = sentences.slice(i + 1).join("");
            const bottomElement = nodeElement.cloneNode(false) as HTMLElement;
            bottomElement.textContent = bottomText;
            const bottomHeight = Math.max(
                0,
                getHTMLHeight(bottomElement, editorDOM, node.type.name, options) - nodeMarginTop,
            );

            // Bottom would be a widow (< MIN_SPLIT_BOTTOM_LINES). Don't abandon the
            // split — try a SHORTER top prefix instead. A shorter top pushes the
            // next sentence down too, growing the bottom past the threshold while
            // the (smaller) top still fits the freespace. Heights are monotonic in
            // the prefix length, so the loop keeps walking down until it finds the
            // largest prefix that BOTH fits and leaves an adequate bottom; only if
            // no prefix qualifies do we fall out of the loop and move the whole node.
            if (bottomHeight < LINE_HEIGHT * MIN_SPLIT_BOTTOM_LINES) continue;

            // The split position in document space:
            // nodeDocPos + 1 skips the node's opening token; topText.length then walks
            // through the text characters (marks are zero-width in ProseMirror's position space).
            return {
                pos: nodeDocPos + 1 + topText.length,
                offset: topText.length,
                topHeight,
                bottomHeight,
            };
        }
    }

    // No valid split: either the first sentence alone is too tall to fit, or every
    // prefix that fits would leave a too-short widow on the next page. Move the whole node.
    return null;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const paginationKey = new PluginKey("pagination");

interface PaginationState {
    decset: DecorationSet;
    breaks: PageBreakInfo[];
    lastPageFreespace: number;
    firstPageLabel: string;
    /** Whether page 1 carries a frozen page-lock token (drives its lock badge). */
    firstPageLocked: boolean;
    /** Max revision index per page (index 0 = page 1), for the `*` header
     *  placeholder. Empty unless a header template uses `*`. */
    pageRevisions: number[];
}

/**
 * Compute display labels for every page using the same token math that
 * powers scene locking. Page 1 is anchored to the sentinel PAGE_ONE_KEY;
 * later pages are anchored to the data-id of the top-level node that
 * begins them. Returns one label per page (length = breaks.length + 1).
 *
 * Synthetic empty-page breaks consume one "logical page" each — their
 * anchorId comes from the page-lock map, and the page that physically
 * follows the empty slot gets its own label slot in the result.
 */
function computePageLabels(
    breaks: PageBreakInfo[],
    pageLocks: PersistentPageMap,
    skippedLetters: readonly string[],
): SceneLabel[] {
    const anchors: string[] = [PAGE_ONE_KEY];
    for (const b of breaks) {
        // Empty pages anchor to the orphan lock's anchorId. Real pages anchor
        // to the data-id of the top-level node where the page starts. If
        // anchorId is somehow missing, fall back to a unique synthetic key
        // so the label-computer still produces a usable result.
        anchors.push(b.anchorId ?? `__break_${b.pos}_${b.pagenum}__`);
    }
    return computeSceneLabels(anchors, pageLocks, "suffix", skippedLetters);
}

const createPaginationPlugin = (extension: {
    options: PaginationOptions;
    editor: Editor;
    storage: { fontsReady: boolean };
}) =>
    new Plugin({
        key: paginationKey,
        state: {
            init: (): PaginationState => ({
                decset: DecorationSet.empty,
                breaks: [],
                lastPageFreespace: 0,
                firstPageLabel: "1",
                firstPageLocked: false,
                pageRevisions: [],
            }),
            apply: timeApply("pagination", (tr, value: PaginationState, oldState, newState): PaginationState => {
                // Wait for the screenplay fonts to finish loading before doing
                // anything. Measuring against the OS monospace fallback writes
                // wrong heights into the cache; gating here keeps the cache
                // empty until the real font is in play. onCreate dispatches a
                // forcePaginationUpdate once fonts.ready resolves, which is
                // what eventually pulls us past this guard.
                if (!extension.storage.fontsReady) return value;

                const options = extension.options as PaginationOptions;
                const formatUpdate = tr.getMeta("pageFormatUpdate");
                const forceUpdate = tr.getMeta("forcePaginationUpdate");

                // Only clear height cache on format changes (page size / margins) which
                // affect text-wrapping widths and thus measured heights.
                // forcePaginationUpdate (gaps, headers, startNewPage, refresh) changes
                // layout but not node heights — the cached measurements stay valid.
                if (formatUpdate) {
                    heightCache.clear();
                }

                // Nothing pagination-related changed
                if (!tr.docChanged && !forceUpdate && !formatUpdate) return value;

                // UUID assignment by nodeIdDedup only changes data-id attrs — no layout impact
                if (tr.getMeta("nodeDedupId")) return value;

                // Revision stamping only writes revision marks/attrs — no layout
                // impact, so normally skip it. But when a header template uses the
                // `*` page-revision placeholder, a stamp can change what a page's
                // header reads, so let it through to recompute the header content.
                if (tr.getMeta(REVISION_STAMP_META) && !headerUsesRevision(options)) return value;

                const fullRemeasure = forceUpdate || formatUpdate;

                // Track the furthest changed position for the short-circuit break optimization
                let maxChangedPos = -1;
                if (tr.docChanged && !fullRemeasure) {
                    tr.steps.forEach((step) => {
                        const map = step.getMap();
                        map.forEach((_oS: number, _oE: number, _newStart: number, newEnd: number) => {
                            if (newEnd > maxChangedPos) maxChangedPos = newEnd;
                        });
                    });
                }

                // Map old breaks through the transaction for short-circuit comparison
                const mappedOldBreaks = !fullRemeasure
                    ? value.breaks.map((b) => ({ ...b, pos: tr.mapping.map(b.pos) }))
                    : [];
                const oldBreakByPos = new Map<number, { info: PageBreakInfo; index: number }>();
                mappedOldBreaks.forEach((b, i) => oldBreakByPos.set(b.pos, { info: b, index: i }));

                // --- Single pass: measure heights + compute page breaks ---
                const editor = extension.editor;
                if (!editor.isInitialized || !extension.editor.view?.dom) return value;

                const editorDOM = extension.editor.view.dom as HTMLElement;

                // extension.options may lag behind the synchronous mutations done by the
                // commands (Tiptap options-object identity issue). editorDOM's inline style
                // is always current because syncVars writes to it inside every command,
                // before the transaction is dispatched. Override the stale option fields.
                const _ph = editorDOM.style.getPropertyValue("--page-height");
                const _pw = editorDOM.style.getPropertyValue("--page-width");
                const _mt = editorDOM.style.getPropertyValue("--page-margin-top");
                const _mb = editorDOM.style.getPropertyValue("--page-margin-bottom");
                const _ml = editorDOM.style.getPropertyValue("--page-margin-left");
                const _mr = editorDOM.style.getPropertyValue("--page-margin-right");
                if (_ph) options.pageHeight = parseFloat(_ph);
                if (_pw) options.pageWidth = parseFloat(_pw);
                if (_mt) options.marginTop = parseFloat(_mt);
                if (_mb) options.marginBottom = parseFloat(_mb);
                if (_ml) options.marginLeft = parseFloat(_ml);
                if (_mr) options.marginRight = parseFloat(_mr);
                const _snp = editorDOM.dataset.startNewPageTypes;
                if (_snp) options.startNewPageTypes = new Set(JSON.parse(_snp));
                // Header/footer templates are bridged through the DOM (see
                // syncHeaderFooterData) because `options` here can lag the
                // command's mutations — without this, saved header/footer edits
                // wouldn't appear until a refresh.
                const _hdr = editorDOM.dataset.paginationHeader;
                if (_hdr) {
                    const h = JSON.parse(_hdr) as Pick<
                        PaginationOptions,
                        "headerLeft" | "headerMiddle" | "headerRight" | "customHeader"
                    >;
                    options.headerLeft = h.headerLeft;
                    options.headerMiddle = h.headerMiddle;
                    options.headerRight = h.headerRight;
                    options.customHeader = h.customHeader;
                }
                const _ftr = editorDOM.dataset.paginationFooter;
                if (_ftr) {
                    const f = JSON.parse(_ftr) as Pick<
                        PaginationOptions,
                        "footerLeft" | "footerMiddle" | "footerRight" | "customFooter"
                    >;
                    options.footerLeft = f.footerLeft;
                    options.footerMiddle = f.footerMiddle;
                    options.footerRight = f.footerRight;
                    options.customFooter = f.customFooter;
                }

                const serializer = DOMSerializer.fromSchema(newState.schema);

                // --- Page-lock setup ---
                // Hot-path discipline: when locking is off (the common case),
                // pageLocks/lockedAnchorIds stay null and the per-node check
                // short-circuits on the first `&&` — zero allocations, zero
                // map lookups. The set is rebuilt once per pass when locking
                // is active; lock counts are typically tens, never thousands.
                const pageLocking = options.getPageLocking?.() ?? false;
                const pageLocks: PersistentPageMap | null = pageLocking ? (options.getPageLocks?.() ?? null) : null;
                const lockedAnchorIds: Set<string> | null = pageLocks
                    ? new Set(Object.keys(pageLocks).filter((k) => k !== PAGE_ONE_KEY))
                    : null;
                // Tracks locked anchors already consumed by a break in this pass.
                // ProseMirror's split (Enter at position 0 of a node) duplicates
                // node attrs across both halves — including data-id — so until
                // node-id-dedup-extension runs in appendTransaction we transiently
                // see the same locked anchor twice. Without this set, both halves
                // would each force a page break, briefly rendering a phantom page
                // with the same locked label until the dedup transaction fires.
                const consumedAnchors = new Set<string>();
                const skippedLetters = options.getSkippedLetters?.() ?? [];

                const contentHeight = options.pageHeight - options.marginTop - options.marginBottom;
                const breaks: PageBreakInfo[] = [];
                let pagePos = 0;
                // Top margin (px) stripped from the current page's first whole node by the
                // .pagination-doc-start / .pagination-break-start CSS rule. Added back to the
                // ending page's freespace at each break so every page stays a constant height
                // even though the first node renders shorter than it measures. Continuation
                // pages (after a mid-node sentence split) keep this at 0 — their first item is
                // not a page-start node and never had a margin to strip. See nodeTopMargin.
                let pageStartMargin = 0;
                let pagenum = 1;
                const childCount = newState.doc.childCount;
                let offset = 0;

                // Tracks the most recent Character cue text so we can label split-dialogue breaks
                // with "CHARACTER (CONT'D)" on the next page.
                let lastCharName = "";

                // Set when the short-circuit exits the per-node loop early.
                // pagePos at that point reflects only the carry node(s) sitting
                // on the new page right after the matched break — not the real
                // last page — so the post-loop freespace computation must NOT
                // derive from pagePos. The previous pass's lastPageFreespace is
                // still authoritative because the short-circuit condition (matching
                // pos / freespace / contdName past maxChangedPos) guarantees every
                // subsequent page is byte-identical to the previous layout.
                let shortCircuited = false;

                // Nodes on the current page, oldest first; reset at every break, so it
                // only ever holds one page's worth (bounded by page height). The orphan
                // walkback scans it from the end and must see the ENTIRE trailing
                // keep-with-next run — Scene → Character → Parenthetical is already 3
                // long — so a fixed 3-slot window would strand the head of longer runs.
                let lastNodes: NodeInfo[] = [];
                for (let i = 0; i < childCount; i++) {
                    const node = newState.doc.child(i);
                    const pos = offset;
                    offset += node.nodeSize;

                    const nodeType = node.type.name as ScreenplayElement;
                    const logic = BREAK_LOGIC[nodeType];

                    // Use the module-level heightCache (keyed by content) to avoid re-serializing
                    // unchanged nodes. Cache misses (new/edited content) trigger serialization.
                    // element is hoisted so the split block can reuse it without a second serialize.
                    const textContent = node.textContent || "";
                    const cacheKey = `${node.type.name}:${options.pageWidth}:${options.marginLeft}:${options.marginRight}:${node.content.size}:${textContent}`;
                    let height = heightCache.get(cacheKey) ?? null;
                    let element: HTMLElement | null = null;

                    if (height === null) {
                        element = serializer.serializeNode(node) as HTMLElement;
                        height = getHTMLHeight(element, editorDOM, node.type.name, options, node.content.size);
                    }

                    if (height == null) continue;

                    // Track the most recent Character name for CONT'D labels.
                    if (nodeType === ScreenplayElement.Character) {
                        lastCharName = node.textContent.trim();
                    }

                    const dataId: string | undefined = node.attrs["data-id"];

                    // --- Force page break for "start new page" elements and manual breaks ---
                    // A node starts a new page when its type is configured to (startNewPage)
                    // or when the user attached a manual page break to it from the context
                    // menu. Reading node.attrs.pageBreak is a single property access — the
                    // loop already reads node.attrs["data-id"] — so this is hot-path free;
                    // the break itself is only built for the handful of nodes that carry it.
                    const manualBreak = node.attrs.pageBreak === true;
                    if (pagePos > 0 && (manualBreak || options.startNewPageTypes.has(nodeType))) {
                        const freespace = contentHeight - pagePos;
                        breaks.push({
                            pos,
                            pagenum: ++pagenum,
                            // + pageStartMargin: this page's first node rendered margin-stripped.
                            freespace: Math.max(0, freespace + pageStartMargin),
                            contdName: "",
                            splitNodeType: null,
                            anchorId: dataId,
                            manual: manualBreak,
                        });
                        // New page's first node margin is set by the pagePos === 0 path below.
                        pagePos = 0;
                        lastNodes = [];
                    }

                    // --- Force page break for locked page anchors ---
                    // O(1) Set.has when locking is on; the leading `lockedAnchorIds &&`
                    // short-circuits to false when locking is disabled — hot-path safe.
                    // The `consumedAnchors` guard ignores the transient duplicate
                    // data-id that appears after Enter splits a locked anchor — only
                    // the first occurrence in doc order is honored as the lock site,
                    // matching the post-dedup state and avoiding a phantom break.
                    if (lockedAnchorIds && dataId && lockedAnchorIds.has(dataId) && !consumedAnchors.has(dataId)) {
                        consumedAnchors.add(dataId);
                        const lockInfo = pageLocks?.[dataId];
                        const splitOffset = lockInfo?.splitOffset;
                        const textLen = node.textContent?.length ?? 0;

                        if (pagePos > 0 && splitOffset != null && splitOffset > 0 && splitOffset < textLen) {
                            // The lock was originally created on a mid-node sentence split
                            // (straddling dialogue or action). Reproduce that split here:
                            // top portion stays on the current page, break goes at the
                            // stored offset, bottom portion starts the locked page. Without
                            // this branch the whole node would be force-pushed to the next
                            // page, making the locked page taller than its frozen layout
                            // and forcing a phantom "A" page to be inserted before it.
                            if (!element) element = serializer.serializeNode(node) as HTMLElement;

                            const topText = node.textContent.slice(0, splitOffset);
                            const topElement = element.cloneNode(false) as HTMLElement;
                            topElement.textContent = topText;
                            const topHeight = getHTMLHeight(topElement, editorDOM, node.type.name, options);

                            // Bottom = the continuation as it renders on the locked page: the
                            // bottom text wraps fresh after the block break widget, so measure it
                            // standalone and strip the node's top margin (the mid-node continuation
                            // has none). Deriving (height - topHeight) instead would mis-size the
                            // page when splitOffset falls mid-line — see trySplitNode.
                            const bottomText = node.textContent.slice(splitOffset);
                            const bottomElement = element.cloneNode(false) as HTMLElement;
                            bottomElement.textContent = bottomText;
                            const bottomHeight = Math.max(
                                0,
                                getHTMLHeight(bottomElement, editorDOM, node.type.name, options) -
                                    nodeTopMargin(nodeType),
                            );

                            pagePos += topHeight;
                            const freespace = contentHeight - pagePos;

                            breaks.push({
                                pos: pos + 1 + splitOffset,
                                pagenum: ++pagenum,
                                // + pageStartMargin: the ending page's first node was margin-stripped.
                                freespace: Math.max(0, freespace + pageStartMargin),
                                contdName: logic?.showMoreContd ? lastCharName : "",
                                splitNodeType: nodeType,
                                anchorId: dataId,
                                splitOffset,
                            });

                            // The locked page begins with this node's continuation (a mid-node
                            // split is not a page-start node) — no top margin to strip.
                            pageStartMargin = 0;
                            pagePos = bottomHeight;
                            lastNodes = [];
                            lastNodes.push({
                                pos,
                                type: nodeType,
                                height: bottomHeight,
                                positionTop: 0,
                                dataId,
                            });
                            continue;
                        }

                        if (pagePos > 0) {
                            // Whole-node lock: force break before the anchor so the locked
                            // page begins exactly with this node.
                            const freespace = contentHeight - pagePos;
                            breaks.push({
                                pos,
                                pagenum: ++pagenum,
                                // + pageStartMargin: this page's first node rendered margin-stripped.
                                freespace: Math.max(0, freespace + pageStartMargin),
                                contdName: "",
                                splitNodeType: null,
                                anchorId: dataId,
                            });
                            // New page's first node margin is set by the pagePos === 0 path below.
                            pagePos = 0;
                            lastNodes = [];
                        }
                    }

                    // Accumulate height on current page.
                    // pagePos === 0 means this whole node opens a fresh page (doc start, or a
                    // forced/locked/orphan whole-node break reset it). Such nodes render with
                    // their top margin stripped, so remember that margin to pad the ending
                    // page's freespace when the next break is recorded.
                    if (pagePos === 0) {
                        pageStartMargin = nodeTopMargin(nodeType);
                    }
                    pagePos += height;

                    // Record this node for orphan resolution; the walkback at the next
                    // break scans this list backward through the trailing keep-with-next run.
                    lastNodes.push({
                        pos,
                        type: nodeType,
                        height,
                        positionTop: pagePos - height,
                        dataId,
                    });

                    // Page break needed — record it and reset page position
                    if (pagePos > contentHeight) {
                        // freespace = how much room was left on the page before this node was added
                        const freespaceBeforeNode = contentHeight - (pagePos - height);

                        // --- Sentence split (Action / Dialogue only) ---
                        // Tried BEFORE orphan resolution: a successful split keeps the top portion
                        // on the current page without moving any preceding nodes.
                        if (
                            logic?.canSplit &&
                            freespaceBeforeNode > MIN_SPLIT_FREESPACE &&
                            height > logic.minSplitHeight
                        ) {
                            // Serialize lazily — only needed here when not already serialized above.
                            if (!element) element = serializer.serializeNode(node) as HTMLElement;

                            const split = trySplitNode(
                                node,
                                pos,
                                nodeTopMargin(nodeType),
                                freespaceBeforeNode,
                                element,
                                editorDOM,
                                options,
                            );
                            if (split) {
                                breaks.push({
                                    pos: split.pos,
                                    pagenum: ++pagenum,
                                    // + pageStartMargin: the ending page's first node was margin-stripped.
                                    freespace: Math.max(0, freespaceBeforeNode - split.topHeight + pageStartMargin),
                                    // contdName non-empty for dialogue: triggers (MORE)/(CONT'D) labels.
                                    contdName: logic.showMoreContd ? lastCharName : "",
                                    // splitNodeType drives the overlay padding-escape in createPageBreakWidget.
                                    splitNodeType: nodeType,
                                    // Anchor for page locking: the node being split owns both halves.
                                    anchorId: dataId,
                                    // splitOffset is captured by the production panel when locking,
                                    // so the same mid-node split can be reproduced on later recomputes
                                    // instead of force-pushing the whole node onto the locked page.
                                    splitOffset: split.offset,
                                });
                                // The bottom half of the split node is the first item on the new
                                // page; a mid-node continuation is not a page-start node, so it has
                                // no top margin to strip.
                                pageStartMargin = 0;
                                pagePos = split.bottomHeight;
                                lastNodes = [];
                                lastNodes.push({
                                    pos,
                                    type: nodeType,
                                    height: split.bottomHeight,
                                    positionTop: 0,
                                    dataId,
                                });
                                continue; // split handled — skip orphan resolution for this node
                            }
                        }

                        // --- Orphan resolution ---
                        // Walk back through this page's nodes, sliding the break before each
                        // node that would otherwise be stranded as the page's last item: while
                        // the would-be last node has keepWithNext, carry it (and its height) to
                        // the next page. This handles a keep-with-next run of ANY length, e.g.
                        // Scene → Character → Parenthetical → Dialogue, not just the two-node
                        // case. It stops at the first node safe to end a page on, at a locked
                        // anchor (which owns its page), or before the page's first node.
                        let breakPos = pos;
                        let carryHeight = height; // cumulative height that moves to the next page
                        let backCount = 0; // how many nodes slid back

                        // lastNodes[length - 1] is the current (overflowing) node; index
                        // (length - 1 - back) walks backward from it (back = 1 is the last
                        // fitted node). The `back < length - 1` bound never reaches index 0,
                        // so at least one node always stays — a break can never empty a page.
                        for (let back = 1; back < lastNodes.length - 1; back++) {
                            const prev = lastNodes[lastNodes.length - 1 - back];
                            if (!prev) break;
                            // A locked anchor owns its page and must never be displaced by
                            // walkback — otherwise the next overflow would yank it onto an
                            // A page and the locked frame would lose its head.
                            if (lockedAnchorIds && prev.dataId && lockedAnchorIds.has(prev.dataId)) {
                                break;
                            }
                            if (BREAK_LOGIC[prev.type]?.keepWithNext) {
                                breakPos = prev.pos;
                                carryHeight += prev.height;
                                backCount = back;
                            } else {
                                break; // stop as soon as we find a node that is safe to end a page
                            }
                        }

                        // freespace = space left before the first node that moved down.
                        // That first moving node sits backCount steps back from the current node;
                        // positionTop is its accumulated page height just before it was added —
                        // i.e. the used space above it.
                        const firstMovingNode = lastNodes[lastNodes.length - 1 - backCount];
                        const freespace = contentHeight - (firstMovingNode?.positionTop ?? pagePos - height);

                        // If the first node moving to the next page is Dialogue or Parenthetical,
                        // the Character cue remains on the previous page and we need (MORE)/(CONT'D).
                        // If the Character itself is being carried (e.g. Character → Parenthetical
                        // double-orphan), the whole block starts fresh — no labels needed.
                        const firstMovingType = firstMovingNode?.type;
                        const isDialogueSplit =
                            lastCharName !== "" &&
                            (firstMovingType === ScreenplayElement.Dialogue ||
                                firstMovingType === ScreenplayElement.Parenthetical);

                        // Anchor = data-id of the first node that moved to the new page.
                        // When backCount==0 the current node is the one moving (no walkback);
                        // otherwise the carried-back node from the buffer owns the anchor.
                        const anchorDataId = backCount === 0 ? dataId : firstMovingNode?.dataId;

                        const breakInfo: PageBreakInfo = {
                            pos: breakPos,
                            pagenum: pagenum + 1,
                            // + pageStartMargin: the ending page's first node was margin-stripped.
                            freespace: Math.max(0, freespace + pageStartMargin),
                            contdName: isDialogueSplit ? lastCharName : "",
                            splitNodeType: null,
                            anchorId: anchorDataId,
                        };
                        breaks.push(breakInfo);
                        pagenum++;
                        pagePos = carryHeight;

                        // The first node carried onto the new page renders margin-stripped
                        // (it gets the .pagination-break-start class). Remember its margin for
                        // the next break's freespace — firstMovingNode carries its type, so no
                        // node re-lookup is needed (it is the current node when backCount === 0,
                        // otherwise the keep-with-next node carried back from the buffer).
                        pageStartMargin = nodeTopMargin(firstMovingNode?.type ?? nodeType);

                        // positionTop values in the buffer are page-relative — reset and re-seed
                        // with the carry nodes using new-page positionTop values so orphan checking
                        // works correctly on the next break.
                        const carryNodes: NodeInfo[] = [];
                        let carryTop = 0;
                        for (let back = backCount; back >= 0; back--) {
                            const n = lastNodes[lastNodes.length - 1 - back];
                            carryNodes.push({ ...n, positionTop: carryTop });
                            carryTop += n.height;
                        }
                        // carryNodes is already oldest→newest with fresh positionTop values,
                        // which is exactly the page-relative ordering lastNodes expects.
                        lastNodes = carryNodes;

                        // Short-circuit: past the changed range and this break matches an old break
                        // (same position, freespace, and contdName) → layout is back in sync;
                        // copy the remaining old breaks and stop the loop early.
                        if (!fullRemeasure && pos > maxChangedPos) {
                            const old = oldBreakByPos.get(breakInfo.pos);
                            if (
                                old &&
                                old.info.freespace === breakInfo.freespace &&
                                old.info.contdName === breakInfo.contdName
                            ) {
                                for (let j = old.index + 1; j < mappedOldBreaks.length; j++) {
                                    pagenum++;
                                    // Spread preserves all fields (contdName, splitNodeType, …); override pagenum only.
                                    breaks.push({ ...mappedOldBreaks[j], pagenum });
                                }
                                shortCircuited = true;
                                break;
                            }
                        }
                    }
                }

                // Compute remaining space on the last page so the last-page widget
                // can pad it to full page height. Mutable because orphan handling
                // may consume it: when an orphan synthetic empty page lands at
                // doc end, it absorbs this freespace so the last real page stays
                // at its full height and the empty page renders after it.
                //
                // When the per-node loop short-circuited, pagePos is the carry
                // height after the matched break — NOT the height of the real
                // last page — so deriving from it would make the last page's
                // spacer grow or shrink with every edit on earlier pages. The
                // short-circuit condition guarantees content past that break
                // is identical to the previous pass, so the previously stored
                // freespace is still the correct answer.
                // + pageStartMargin: the last page's first node also renders margin-stripped.
                // (shortCircuited reuses the previous pass's value, already compensated.)
                const lastPageFreespace = shortCircuited
                    ? value.lastPageFreespace
                    : Math.max(0, contentHeight - pagePos + pageStartMargin);

                // --- Orphan page collection ---
                // A locked page whose anchor data-id is no longer present in the
                // doc is an "orphan" — e.g. the user emptied a locked page and
                // collapsed it (see PAGE_COLLAPSE_META), or a collaborator's edit
                // removed its anchor. Its frozen number must not vanish, so its
                // token is folded into the FOLLOWING surviving page as a range
                // ("5-6") — or reclaimed by a provisional page grown into the
                // gap — by the absorb pipeline below, exactly like an omitted
                // scene's removed pages.
                const orphanTokens: SceneToken[] = [];
                if (pageLocks) {
                    const seenAnchors = new Set<string>();
                    for (const b of breaks) {
                        if (b.anchorId) seenAnchors.add(b.anchorId);
                    }
                    for (const [anchorId, page] of Object.entries(pageLocks)) {
                        if (anchorId === PAGE_ONE_KEY || !page?.token) continue;
                        if (seenAnchors.has(anchorId)) continue;
                        orphanTokens.push(page.token);
                    }
                }

                // --- Label assignment ---
                // Run computeSceneLabels over [page1Anchor, ...breakAnchors] so locked
                // pages keep their frozen labels, provisional inserts get suffix labels
                // (e.g. "4A"), and pages past the last lock continue the integer sequence.
                let firstPageLabel = "1";
                let firstPageLocked = false;
                if (pageLocks) {
                    // Omitted scenes collapse whole locked pages out of the
                    // document. Each such removed page contributes an "absorbed"
                    // token we must keep visible so the numbering doesn't jump
                    // ("14" then "16"). Two outcomes per token, decided below:
                    //   1. RECLAIM — if content has grown a provisional (unlocked)
                    //      page back into the gap where the token belongs, hand the
                    //      token to that page so it becomes a real numbered page
                    //      again ("15"). This is what lets a collapsed "15-16"
                    //      revert to a fresh "15" + "16" as the user types.
                    //   2. FOLD — no provisional page available: fold the token
                    //      into the FOLLOWING surviving page as the low end of a
                    //      range. Deleting page 15 makes the next page read
                    //      "15-16"; deleting 14 too makes it "14-16".
                    // Two sources feed this: omitted scenes (their locks were
                    // deleted from the map; tokens come via getOmittedPages) and
                    // orphan locks still in the map (collapsed/deleted pages).
                    const absorbed = [...(options.getOmittedPages?.() ?? []), ...orphanTokens].sort(compareTokens);

                    // Per-page frozen token (null for provisional pages). Page 0
                    // is page 1 (PAGE_ONE_KEY); page p>0 starts at breaks[p-1].
                    const pageCount = breaks.length + 1;
                    const lockedTok: (SceneToken | null)[] = new Array(pageCount);
                    for (let p = 0; p < pageCount; p++) {
                        const anchor = p === 0 ? PAGE_ONE_KEY : breaks[p - 1].anchorId;
                        lockedTok[p] = (anchor ? pageLocks[anchor]?.token : undefined) ?? null;
                    }

                    const synthetic: Record<string, { token: SceneToken }> = {};
                    const leftover: SceneToken[] = [];
                    if (absorbed.length > 0) {
                        // Nearest locked token before / after each page, so we can
                        // tell which gap a provisional page sits in.
                        const prevLockedArr: (SceneToken | null)[] = new Array(pageCount);
                        const nextLockedArr: (SceneToken | null)[] = new Array(pageCount);
                        let seen: SceneToken | null = null;
                        for (let p = 0; p < pageCount; p++) {
                            prevLockedArr[p] = seen;
                            if (lockedTok[p]) seen = lockedTok[p];
                        }
                        seen = null;
                        for (let p = pageCount - 1; p >= 0; p--) {
                            nextLockedArr[p] = seen;
                            if (lockedTok[p]) seen = lockedTok[p];
                        }

                        const consumed = new Set<number>();
                        for (const t of absorbed) {
                            let placed = false;
                            // Page 0 is page 1 and never reclaims an absorbed
                            // number; start at the first real break.
                            for (let p = 1; p < pageCount; p++) {
                                if (consumed.has(p) || lockedTok[p]) continue;
                                const before = prevLockedArr[p];
                                const after = nextLockedArr[p];
                                // Provisional page p is in t's gap when t sorts
                                // strictly between the locks bounding p.
                                if (
                                    (before === null || compareTokens(before, t) < 0) &&
                                    (after === null || compareTokens(t, after) < 0)
                                ) {
                                    const anchor = breaks[p - 1].anchorId;
                                    if (anchor) {
                                        synthetic[anchor] = { token: t };
                                        consumed.add(p);
                                        placed = true;
                                        break;
                                    }
                                }
                            }
                            if (!placed) leftover.push(t);
                        }
                    }

                    // Reclaimed pages join the lock map for label computation so
                    // they get their absorbed number (and following provisional
                    // pages suffix off it: "18", "18A", …).
                    const labelLocks = Object.keys(synthetic).length > 0 ? { ...pageLocks, ...synthetic } : pageLocks;
                    const pageLabels = computePageLabels(breaks, labelLocks, skippedLetters);

                    // Fold the unreclaimed tokens into the FOLLOWING surviving
                    // page — the first page whose token is larger — so the
                    // removed number becomes the low end of that page's range
                    // ("15-16", then "14-16" as more are removed). A removed
                    // page past the last surviving page has no follower; it
                    // falls back to the last page as the high end instead.
                    if (leftover.length > 0) {
                        const alphabet = buildSceneAlphabet(skippedLetters);
                        const bucket = new Map<number, SceneToken[]>();
                        for (const t of leftover) {
                            let attach = pageLabels.length - 1;
                            for (let p = 0; p < pageLabels.length; p++) {
                                if (compareTokens(pageLabels[p].token, t) > 0) {
                                    attach = p;
                                    break;
                                }
                            }
                            const list = bucket.get(attach);
                            if (list) list.push(t);
                            else bucket.set(attach, [t]);
                        }
                        // A page's range spans the min..max of its own token plus
                        // every number it absorbed — "14-16" for own 16 absorbing
                        // 14 and 15, "14-15" for a trailing own 14 absorbing 15.
                        for (const [p, tokens] of bucket) {
                            let lo = pageLabels[p].token;
                            let hi = pageLabels[p].token;
                            for (const t of tokens) {
                                if (compareTokens(t, lo) < 0) lo = t;
                                if (compareTokens(t, hi) > 0) hi = t;
                            }
                            const loLabel = compileSceneLabel(lo, alphabet);
                            const hiLabel = compileSceneLabel(hi, alphabet);
                            pageLabels[p].label = loLabel === hiLabel ? loLabel : `${loLabel}-${hiLabel}`;
                        }
                    }

                    firstPageLabel = pageLabels[0].label;
                    firstPageLocked = pageLabels[0].status === "locked";
                    for (let i = 0; i < breaks.length; i++) {
                        breaks[i].label = pageLabels[i + 1].label;
                        breaks[i].prevLabel = pageLabels[i].label;
                        breaks[i].locked = pageLabels[i + 1].status === "locked";
                    }
                }

                // Per-page revision (only when a header uses the `*` placeholder);
                // a change here re-renders headers even when the breaks are identical.
                const usesRevision = headerUsesRevision(options);
                const pageRevisions = usesRevision ? computePageRevisions(newState.doc, breaks) : [];
                const revisionsChanged =
                    usesRevision &&
                    (pageRevisions.length !== value.pageRevisions.length ||
                        pageRevisions.some((r, i) => r !== value.pageRevisions[i]));

                // Check if breaks actually changed compared to mapped old breaks.
                const breaksChanged =
                    fullRemeasure ||
                    lastPageFreespace !== value.lastPageFreespace ||
                    firstPageLabel !== value.firstPageLabel ||
                    firstPageLocked !== value.firstPageLocked ||
                    breaks.length !== mappedOldBreaks.length ||
                    breaks.some(
                        (b, i) =>
                            b.pos !== mappedOldBreaks[i].pos ||
                            b.freespace !== mappedOldBreaks[i].freespace ||
                            b.contdName !== mappedOldBreaks[i].contdName ||
                            b.label !== mappedOldBreaks[i].label ||
                            b.prevLabel !== mappedOldBreaks[i].prevLabel ||
                            !!b.isEmpty !== !!mappedOldBreaks[i].isEmpty ||
                            !!b.locked !== !!mappedOldBreaks[i].locked,
                    );

                // Always map the previous set first: it re-anchors every existing
                // widget to its new position AND preserves the Decoration instances,
                // which is what lets the rebuild below reuse unchanged widgets'
                // mounted DOM (see buildReuseMap).
                const mapped = value.decset.map(tr.mapping, tr.doc);

                let decset: DecorationSet;
                if (breaksChanged || revisionsChanged) {
                    // Rebuild, but reuse the previous Decoration instance for every
                    // widget whose position+key is unchanged. On a typical edit only
                    // the last-page widget (or a break near the edit) actually
                    // changes, so ~95 of ~96 widgets keep their DOM untouched and the
                    // document-wide style recalc collapses to a couple of elements.
                    decset = buildDecorations(
                        newState.doc,
                        breaks,
                        lastPageFreespace,
                        firstPageLabel,
                        firstPageLocked,
                        options,
                        pageRevisions,
                        buildReuseMap(mapped),
                    );
                } else {
                    // Fast path: the set of breaks is unchanged, so the mapped set is
                    // already correct — no rebuild at all.
                    // BUT `DecorationSet.map` silently drops a *widget* whose anchor
                    // sits at a position a replace step touches — e.g. editing a
                    // page's last node, which hosts the following page break at its
                    // trailing boundary (realigning it or re-applying its element
                    // type with no height change keeps `breaks` identical, so we land
                    // here). The lost break makes the next page merge upward into a
                    // too-tall page. `map` never adds decorations, so a drop shows up
                    // as a smaller count — only then do we pay for a rebuild (still
                    // reusing the survivors' instances).
                    decset =
                        mapped.find().length === value.decset.find().length
                            ? mapped
                            : buildDecorations(
                                  newState.doc,
                                  breaks,
                                  lastPageFreespace,
                                  firstPageLabel,
                                  firstPageLocked,
                                  options,
                                  pageRevisions,
                                  buildReuseMap(mapped),
                              );
                }

                return { decset, breaks, lastPageFreespace, firstPageLabel, firstPageLocked, pageRevisions };
            }),
        },
        appendTransaction() {
            return null;
        },
        filterTransaction(tr) {
            // Page-lock guard: prevent content from spilling upward out of a
            // locked page. The signature of that spill — Backspace at the
            // start of a locked anchor, Delete at the end of the node before
            // it, or a selection delete that swallows the anchor — is a locked
            // anchor's data-id disappearing as a RESULT of this transaction. If
            // that would happen, reject it so the cursor stays put and no
            // content moves across the lock.
            if (!tr.docChanged) return true;

            // Allow yjs sync (remote updates and yjs-based undo/redo) through
            // unconditionally — cross-peer consistency must not be blocked by
            // local lock enforcement, and the lock map itself lives in the
            // Yjs doc so peers agree on which pages are locked.
            if (tr.getMeta(ySyncPluginKey)) return true;

            // Scene omit/unomit removes (or restores) an entire scene and
            // re-homes any page locks inside it, so it is allowed to make a
            // locked anchor's data-id disappear. See SCENE_OMIT_META.
            if (tr.getMeta(SCENE_OMIT_META)) return true;

            // Collapsing an emptied locked page deliberately deletes that page's
            // (now empty) anchor node and merges the cursor up to the previous
            // page. See PAGE_COLLAPSE_META and the Backspace handler.
            if (tr.getMeta(PAGE_COLLAPSE_META)) return true;

            // Revision stamping only adds marks / the revision attribute; it never
            // removes a locked anchor's data-id, so it is exempt from the spill
            // guard — and skipping the O(doc) scan keeps it off the hot path.
            if (tr.getMeta(REVISION_STAMP_META)) return true;

            const opts = extension.options as PaginationOptions;
            if (!opts.getPageLocking?.()) return true;

            const pageLocks = opts.getPageLocks?.();
            if (!pageLocks) return true;

            // PAGE_ONE_KEY has no node to defend — page 1 can't lose its
            // lock through doc edits.
            const lockedAnchors: string[] = [];
            for (const key of Object.keys(pageLocks)) {
                if (key !== PAGE_ONE_KEY) lockedAnchors.push(key);
            }
            if (lockedAnchors.length === 0) return true;

            // Fast path: scan the resulting doc once. If every locked anchor is
            // still present, nothing crossed a lock — allow it. This is the
            // common case on every keystroke.
            const after = new Set<string>();
            tr.doc.forEach((node) => {
                const dataId = node.attrs?.["data-id"];
                if (typeof dataId === "string") after.add(dataId);
            });
            let someMissing = false;
            for (const anchor of lockedAnchors) {
                if (!after.has(anchor)) {
                    someMissing = true;
                    break;
                }
            }
            if (!someMissing) return true;

            // A locked anchor is missing from the result. Only reject if THIS
            // transaction is what removed it (present before, gone after). An
            // anchor that was already gone (an orphan-collapsed page whose lock
            // lingers in the map so its number is absorbed) must not block
            // further edits — otherwise every keystroke after a collapse would
            // be rejected.
            const before = new Set<string>();
            // Anchors whose node carried a MANUAL page break are exempt from the
            // spill guard. A manual break is user-controlled, so deleting its
            // (now empty) node must always be allowed — even when production page
            // locking froze that node as an anchor. Without this, forward-Delete
            // and selection-delete of a manual-break line are silently rejected.
            const manualBreakBefore = new Set<string>();
            tr.before.forEach((node) => {
                const dataId = node.attrs?.["data-id"];
                if (typeof dataId !== "string") return;
                before.add(dataId);
                if (node.attrs?.["pageBreak"]) manualBreakBefore.add(dataId);
            });
            for (const anchor of lockedAnchors) {
                if (before.has(anchor) && !after.has(anchor) && !manualBreakBefore.has(anchor)) return false;
            }
            return true;
        },
        props: {
            decorations(state) {
                return (paginationKey.getState(state) as PaginationState)?.decset ?? DecorationSet.empty;
            },
        },
    });

// ---------------------------------------------------------------------------
// Extensions
// ---------------------------------------------------------------------------

/**
 * Declares the `pageBreak` block attribute that drives manual page breaks.
 *
 * Kept SEPARATE from ScriptioPagination on purpose: this extension is part of
 * BASE_EXTENSIONS, so the attribute lives in ScreenplaySchema and survives the
 * full-project `.scriptio` (de)serialization paths (screenplayOf /
 * applyProjectData), which build nodes from BASE_EXTENSIONS alone — without the
 * pagination plugin. The pagination *logic*, the toggle command, and the visual
 * hint stay in ScriptioPagination; only the schema-level attribute lives here.
 *
 * Only meaningful on top-level blocks (the pagination loop walks doc children),
 * so it is limited to those types — off text/marks and the inner dual-dialogue
 * column. Default null so y-prosemirror persists nothing for the vast majority
 * of nodes that never carry a break (createTypeFromElementNode skips null
 * attrs): zero storage and zero hot-path cost.
 */
export const PageBreakAttribute = Extension.create({
    name: "pageBreakAttribute",

    addGlobalAttributes() {
        return [
            {
                types: [
                    ScreenplayElement.Scene,
                    ScreenplayElement.Action,
                    ScreenplayElement.Character,
                    ScreenplayElement.Dialogue,
                    ScreenplayElement.Parenthetical,
                    ScreenplayElement.Transition,
                    ScreenplayElement.Section,
                    ScreenplayElement.Note,
                    ScreenplayElement.DualDialogue,
                ],
                attributes: {
                    pageBreak: {
                        default: null,
                        parseHTML: (element) => (element.getAttribute("data-page-break") === "true" ? true : null),
                        renderHTML: (attributes) => (attributes.pageBreak ? { "data-page-break": "true" } : {}),
                    },
                },
            },
        ];
    },
});

export const ScriptioPagination = Extension.create<PaginationOptions>({
    name: "Pagination",

    addOptions() {
        return defaultOptions;
    },

    addStorage() {
        return {
            initTimer: null as ReturnType<typeof setTimeout> | null,
            /** False until the screenplay @font-face fonts have finished loading.
             *  The plugin's `apply` checks this flag and skips height measurement
             *  while it is false, so the cache never picks up bad heights taken
             *  with a fallback monospace font (Consolas etc.) that produces a
             *  different line-wrap from CourierPrime. */
            fontsReady: false,
        };
    },

    onCreate() {
        const editorDOM = this.editor.view.dom;

        editorDOM.classList.add("pagination");
        syncVars(editorDOM, this.options);
        syncHeaderFooterData(editorDOM, this.options);

        let style = document.getElementById("pagination-style");
        if (!style) {
            style = document.createElement("style");
            style.id = "pagination-style";
            document.head.appendChild(style);
        }
        // Always (re)write the rules. The <style> element is created once and
        // then persists across editor instances and hot reloads, so guarding the
        // assignment (the old `if (!style)`) would pin the very first CSS — a
        // hot-swapped rule set (e.g. a newly added affordance like the page-lock
        // badge) would never take effect until a full page reload.
        style.textContent = `
                .pagination {
                    position: relative;
                    width: var(--page-width) !important;
                    margin: 0 auto !important;
                    min-height: var(--page-height);
                    box-sizing: border-box !important;
                }

                .pagination-first-page,
                .pagination-page-break,
                .pagination-last-page {
                    position: relative;
                    user-select: none;
                    pointer-events: none;
                    padding-left: 0 !important;
                    padding-right: 0 !important;
                    font-weight: normal !important;
                    font-style: normal !important;
                    text-decoration: none !important;
                    text-transform: none !important;
                }

                .pagination-overlay {
                    position: absolute;
                    left: 0;
                    right: 0;
                    z-index: 10;
                    display: flex;
                    flex-direction: column;
                    justify-content: flex-end;
                    background: var(--editor-script-bg);
                }

                .pagination-footer-area,
                .pagination-header-area {
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 var(--page-margin-right) 0 var(--page-margin-left);
                    box-sizing: border-box;
                    background: var(--editor-script-bg);
                }

                .pagination-divider {
                    background: var(--main-bg);
                }

                .pagination-header-left,
                .pagination-header-middle,
                .pagination-header-right,
                .pagination-footer-left,
                .pagination-footer-middle,
                .pagination-footer-right {
                    flex: 1 1 0;
                    min-width: 0;
                    color: var(--editor-text);
                    font-family: var(--font-screenplay);
                    line-height: var(--line-height);
                    white-space: pre;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .pagination-header-left,
                .pagination-footer-left {
                    text-align: left;
                }

                .pagination-header-middle,
                .pagination-footer-middle {
                    text-align: center;
                }

                .pagination-header-right,
                .pagination-footer-right {
                    text-align: right;
                }

                .pagination-empty-page {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--editor-script-bg);
                    color: var(--secondary-text);
                    font-size: 0.85rem;
                    font-weight: 600;
                    letter-spacing: 0.08em;
                    opacity: 0.35;
                    text-transform: uppercase;
                    box-sizing: border-box;
                }

                /* Subtle lock badge for page-locked pages. It floats just past
                   the page's top-right corner, in the gutter. */
                .page-lock-badge {
                    position: absolute;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 22px;
                    height: 22px;
                    color: var(--secondary-text);
                    opacity: 0.5;
                    pointer-events: none;
                    right: 0;
                }

                /* Whole-node pages carry a standalone, zero-height marker at the
                   page-start boundary (a sibling of the break widget / paragraph,
                   NOT inside the content-visibility-contained widget that would
                   clip it). The marker spans the page width and sits at the new
                   page's top edge, so lift the badge by the top margin to reach
                   the physical top-right corner, then nudge it into the gutter. */
                .page-lock-marker {
                    position: relative;
                    height: 0;
                }
                .page-lock-marker > .page-lock-badge {
                    top: 0;
                    transform: translate(calc(100% + 8px), calc(-1 * var(--page-margin-top) + 10px));
                }

                /* Split pages render the badge in the (content-visibility-exempt)
                   header area, whose top already is the page's physical top. */
                .pagination-header-area .page-lock-badge {
                    top: 10px;
                    transform: translateX(calc(100% + 8px));
                }

                /* Manual (context-menu) page break hint. Instead of a faint mark
                   buried in the inter-page gap, the affordance is drawn at the
                   very top of the new page: a line across the full page width,
                   sitting just above the node that begins the page. The marker is
                   anchored to the overlay's bottom edge, which aligns with the
                   page's content-top (the node's top); absolute positioning keeps
                   it out of the overlay's flex flow. */
                .pagination-manual-break-marker {
                    position: absolute;
                    left: 0;
                    right: 0;
                    bottom: 4px;
                    z-index: 2;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    pointer-events: none;
                    user-select: none;
                }
                .pagination-manual-break-line {
                    align-self: stretch;
                    border-top: 1px solid var(--secondary-text);
                    opacity: 0.45;
                }
            `;

        setupTestDiv(editorDOM, this.options);

        // The screenplay @font-face fonts (CourierPrime + fallbacks) load
        // asynchronously. Until the real font is applied, the test div lays
        // text out in the OS monospace fallback (Consolas on Windows), whose
        // slightly different character widths cause text to wrap to a
        // different number of lines. Heights measured against the fallback
        // disagree with what the editor will eventually render — and once
        // cached, they keep that disagreement alive (hence the cold-open vs
        // hard-refresh mismatch, and the shrink-on-edit symptom when a
        // cache-miss re-measures against the now-loaded real font).
        //
        // We defer the first pagination run until the font is genuinely
        // usable; until then the plugin's `apply` returns the empty initial
        // state (no measurement, no cache writes). Once ready we flip the flag
        // and dispatch a single force update — every subsequent measurement
        // happens against the real font, so the heightCache fills with correct
        // values from the start.
        //
        // IMPORTANT: `document.fonts.ready` is NOT enough on Chrome. Chrome
        // loads @font-face fonts lazily (only once a rendered element needs
        // them), so at the moment the editor mounts nothing has triggered the
        // CourierPrime fetch yet — `fonts.ready` resolves reporting
        // status:"loaded" while `fonts.check('12pt "CourierPrime"')` is still
        // false and zero faces are actually loaded. Firefox eagerly starts the
        // load, which is why it worked there but not here. The fix is to
        // ACTIVELY request the faces with `document.fonts.load(...)`, which
        // forces the fetch and resolves only once they are usable for layout.
        const triggerInitialPagination = () => {
            if (this.editor.isDestroyed) return;
            this.storage.fontsReady = true;
            const tr = this.editor.state.tr;
            tr.setMeta("forcePaginationUpdate", true);
            tr.setMeta("addToHistory", false);
            this.editor.view.dispatch(tr);
        };

        const fontsApi = typeof document !== "undefined" ? document.fonts : null;
        if (fontsApi && typeof fontsApi.load === "function") {
            // Actively request every CourierPrime variant the screenplay uses.
            // `load()` forces the fetch (even on Chrome's lazy loader) and
            // resolves once the faces are usable for measurement. `.catch` per
            // spec keeps one failed variant from blocking the others, and a
            // safety timeout guarantees pagination still runs if the network
            // never delivers a font — better a fallback-font layout than a
            // permanently blank document.
            const specs = [
                '12pt "CourierPrime"',
                'bold 12pt "CourierPrime"',
                'italic 12pt "CourierPrime"',
                'bold italic 12pt "CourierPrime"',
            ];
            let fired = false;
            const fireOnce = () => {
                if (fired) return;
                fired = true;
                if (this.storage.initTimer != null) {
                    clearTimeout(this.storage.initTimer);
                    this.storage.initTimer = null;
                }
                triggerInitialPagination();
            };
            Promise.all(specs.map((s) => fontsApi.load(s).catch(() => undefined)))
                .then(() => fireOnce())
                .catch(() => fireOnce());
            // Safety net: never wait more than 3s on the font fetch.
            this.storage.initTimer = setTimeout(() => fireOnce(), 3000);
        } else {
            // No FontFaceSet API (SSR, very old browsers): fall back to the
            // legacy setTimeout(0) trigger so pagination still runs.
            this.storage.initTimer = setTimeout(() => {
                this.storage.initTimer = null;
                triggerInitialPagination();
            }, 0);
        }
    },

    onDestroy() {
        if (this.storage.initTimer != null) {
            clearTimeout(this.storage.initTimer);
            this.storage.initTimer = null;
        }
    },

    addProseMirrorPlugins() {
        return [createPaginationPlugin(this)];
    },

    addKeyboardShortcuts() {
        return {
            Backspace: ({ editor }) => {
                // ProseMirror's joinMaybeClear (a joinBackward variant) deletes
                // the PREVIOUS block instead of the current one whenever the
                // previous block is empty and the two blocks share a type. If
                // that empty previous block is a locked page anchor the plugin's
                // filterTransaction rejects the resulting transaction — the
                // anchor's data-id would disappear — and the cursor appears
                // stuck. Patch both flavors of the case (empty current and
                // non-empty current) so the locked anchor survives and the user
                // still gets the natural "step up one line" / "merge up" feel.
                const { state, view } = editor;
                const { $from, empty } = state.selection;
                if (!empty || $from.parentOffset !== 0) return false;

                const opts = this.options as PaginationOptions;
                if (!opts.getPageLocking?.()) return false;
                const pageLocks = opts.getPageLocks?.();
                if (!pageLocks) return false;

                const curStart = $from.before();
                if (curStart === 0) return false;

                // Manual page breaks are user-controlled and exempt from the lock
                // safeguard: an empty node carrying one must delete like any other
                // line. Defer to the default joinBackward (the filterTransaction
                // exemption lets it through) instead of the orphan-preserving
                // collapse below — otherwise the node goes but its frozen number
                // lingers as a ghost page.
                if ($from.parent.attrs?.["pageBreak"]) return false;

                // Collapse case: the current block is itself a locked page anchor
                // and is now empty (the page's last element was just deleted).
                // Default joinBackward would remove the anchor's data-id and the
                // guard would reject it, leaving a blank page with a stranded
                // empty node. Instead delete the empty anchor node and drop the
                // cursor at the end of the previous page. The lock stays in the
                // map as an orphan so the page's frozen number is absorbed into
                // the following page as a range (e.g. "5-6") rather than vanishing.
                const curDataId = $from.parent.attrs?.["data-id"];
                if ($from.parent.textContent.length === 0 && typeof curDataId === "string" && pageLocks[curDataId]) {
                    const tr = state.tr;
                    tr.delete(curStart, $from.after());
                    tr.setSelection(TextSelection.create(tr.doc, curStart - 1));
                    tr.setMeta(PAGE_COLLAPSE_META, true);
                    view.dispatch(tr);
                    return true;
                }

                const prev = state.doc.resolve(curStart).nodeBefore;
                if (!prev || prev.textContent.length !== 0) return false;

                // An empty PREVIOUS node with a manual break is likewise exempt:
                // backspacing into it should remove the break line, so defer to
                // the default (allowed by the filterTransaction exemption).
                if (prev.attrs?.["pageBreak"]) return false;

                const prevDataId = prev.attrs?.["data-id"];
                if (typeof prevDataId !== "string" || !pageLocks[prevDataId]) return false;

                const tr = state.tr;
                if ($from.parent.textContent.length === 0) {
                    // Both blocks empty: drop the current empty block — the
                    // locked anchor stays put and the cursor parks inside it.
                    tr.delete(curStart, $from.after());
                } else {
                    // Current has text: merge it INTO the empty previous block
                    // via tr.join, which keeps the before node's structure
                    // (and its locked data-id) and absorbs after's content.
                    // join requires both children to share a type; for cross-
                    // type cases we bail out and let the default chain do
                    // whatever fallback it has — those cases don't trip
                    // joinMaybeClear in the first place.
                    if (prev.type !== $from.parent.type) return false;
                    tr.join(curStart);
                }
                tr.setSelection(TextSelection.create(tr.doc, curStart - 1));
                view.dispatch(tr);
                return true;
            },
            Enter: ({ editor }) => {
                // Enter at the very start of a locked page's anchor node.
                //
                // We want the standard "open a line above" feel: the new empty
                // line becomes the page's FIRST line, the page keeps its number,
                // and any overflow flows FORWARD (an A-page that carries real
                // content) — never a blank page pushed backward onto the previous
                // (already full) page.
                //
                // The default split is inconsistent: Action keeps the page token
                // on the new empty half (forward, correct), but keep-with-next
                // types (Character, Parenthetical, Transition, Scene) keep it on
                // the content half, which shoves a blank line backward and spawns
                // a blank A-page on the previous page. Normalize every type to the
                // forward behavior: the empty half retains the locked data-id (so
                // it anchors the page) and the content half gets a fresh id.
                const { state, view } = editor;
                const { $from, empty } = state.selection;
                if (!empty || $from.parentOffset !== 0) return false;
                if ($from.parent.textContent.length === 0) return false; // nothing to push down

                const opts = this.options as PaginationOptions;
                if (!opts.getPageLocking?.()) return false;
                const pageLocks = opts.getPageLocks?.();
                if (!pageLocks) return false;

                const dataId = $from.parent.attrs?.["data-id"];
                if (typeof dataId !== "string" || !pageLocks[dataId]) return false;

                // split with typesAfter re-keying the CONTENT half; the new empty
                // first half keeps the original (locked) data-id and so stays the
                // page anchor.
                const attrs = $from.parent.attrs;
                const tr = state.tr.split($from.pos, 1, [
                    { type: $from.parent.type, attrs: { ...attrs, "data-id": generateNodeId() } },
                ]);
                view.dispatch(tr);
                return true;
            },
        };
    },

    addCommands() {
        return {
            updatePageSize:
                (size) =>
                ({ tr }) => {
                    Object.assign(this.options, size);
                    syncVars(this.editor.view.dom, this.options);
                    tr.setMeta("pageFormatUpdate", true);
                    return true;
                },
            updatePageHeight:
                (h) =>
                ({ tr }) => {
                    this.options.pageHeight = h;
                    syncVars(this.editor.view.dom, this.options);
                    tr.setMeta("pageFormatUpdate", true);
                    return true;
                },
            updatePageWidth:
                (w) =>
                ({ tr }) => {
                    this.options.pageWidth = w;
                    syncVars(this.editor.view.dom, this.options);
                    tr.setMeta("pageFormatUpdate", true);
                    return true;
                },
            updatePageGap:
                (g) =>
                ({ tr }) => {
                    this.options.pageGap = g;
                    tr.setMeta("forcePaginationUpdate", true);
                    return true;
                },
            updateMargins:
                (m) =>
                ({ tr }) => {
                    Object.assign(this.options, {
                        marginTop: m.top,
                        marginBottom: m.bottom,
                        marginLeft: m.left,
                        marginRight: m.right,
                    });
                    syncVars(this.editor.view.dom, this.options);
                    tr.setMeta("pageFormatUpdate", true);
                    return true;
                },
            updateHeaderContent:
                (l, m, r, p) =>
                ({ tr }) => {
                    if (p !== undefined) this.options.customHeader[p] = { headerLeft: l, headerMiddle: m, headerRight: r };
                    else {
                        this.options.headerLeft = l;
                        this.options.headerMiddle = m;
                        this.options.headerRight = r;
                    }
                    syncHeaderFooterData(this.editor.view.dom, this.options);
                    tr.setMeta("forcePaginationUpdate", true);
                    return true;
                },
            updateFooterContent:
                (l, m, r, p) =>
                ({ tr }) => {
                    if (p !== undefined) this.options.customFooter[p] = { footerLeft: l, footerMiddle: m, footerRight: r };
                    else {
                        this.options.footerLeft = l;
                        this.options.footerMiddle = m;
                        this.options.footerRight = r;
                    }
                    syncHeaderFooterData(this.editor.view.dom, this.options);
                    tr.setMeta("forcePaginationUpdate", true);
                    return true;
                },
            updatePageBreakBackground:
                (c) =>
                ({ tr }) => {
                    this.options.pageBreakBackground = c;
                    tr.setMeta("forcePaginationUpdate", true);
                    return true;
                },
            updateStartNewPageTypes:
                (types) =>
                ({ tr }) => {
                    this.options.startNewPageTypes = types;
                    this.editor.view.dom.dataset.startNewPageTypes = JSON.stringify([...types]);
                    tr.setMeta("forcePaginationUpdate", true);
                    return true;
                },
            refreshPagination:
                () =>
                ({ tr }) => {
                    tr.setMeta("forcePaginationUpdate", true);
                    return true;
                },
            toggleManualPageBreak:
                (pos) =>
                ({ state, tr, dispatch }) => {
                    // `pos` is the start position of a top-level block (the value
                    // the context menu resolves via $pos.before(1)). Flip its
                    // pageBreak flag; the pagination plugin picks the change up
                    // through the normal doc-changed path and re-breaks the page.
                    const node = state.doc.nodeAt(pos);
                    if (!node || !node.isBlock) return false;
                    if (dispatch) {
                        const next = node.attrs.pageBreak ? null : true;
                        tr.setNodeMarkup(pos, undefined, { ...node.attrs, pageBreak: next });
                        dispatch(tr);
                    }
                    return true;
                },
        };
    },
});

/**
 * Returns the 1-based page number for a given document position,
 * using the pagination plugin state stored in the editor.
 * Returns 1 if pagination state is unavailable.
 */
export function getPageForPos(editor: Editor, pos: number): number {
    const state = paginationKey.getState(editor.state) as PaginationState | undefined;
    if (!state || state.breaks.length === 0) return 1;
    let page = 1;
    for (const b of state.breaks) {
        if (b.pos > pos) break;
        page = b.pagenum;
    }
    return page;
}

/**
 * Returns the display label (e.g. "4", "4A") for the page containing
 * the given document position. Falls back to the integer pagenum when
 * page locking isn't active.
 */
export function getPageLabelForPos(editor: Editor, pos: number): string {
    const state = paginationKey.getState(editor.state) as PaginationState | undefined;
    if (!state) return "1";
    if (state.breaks.length === 0) return state.firstPageLabel;
    let label = state.firstPageLabel;
    for (const b of state.breaks) {
        if (b.pos > pos) break;
        label = b.label ?? String(b.pagenum);
    }
    return label;
}

/**
 * Returns the ordered list of page anchors for the current document
 * (page 1 sentinel first, then the data-id of each subsequent page's
 * first top-level node). Used by the ProductionPanel to snapshot the
 * current layout when locking pages and to compute provisional labels.
 *
 * Synthetic empty-page breaks contribute their orphan anchor id, so the
 * sequence stays aligned with what the user sees in the editor.
 */
export function getPageAnchors(editor: Editor): string[] {
    const state = paginationKey.getState(editor.state) as PaginationState | undefined;
    if (!state) return [PAGE_ONE_KEY];
    const out: string[] = [PAGE_ONE_KEY];
    for (const b of state.breaks) {
        if (b.anchorId) out.push(b.anchorId);
    }
    return out;
}

export interface PageAnchorInfo {
    anchorId: string;
    /** Character offset within the anchor node where the page begins.
     *  Set when the page starts on the bottom half of a sentence-split node;
     *  undefined for whole-node anchors. Frozen into the page lock so the
     *  split survives recomputes. */
    splitOffset?: number;
}

/**
 * Same ordering as {@link getPageAnchors} but each entry also carries the
 * splitOffset (when the page begins mid-node). Used by the production panel
 * when first locking pages so the lock map can reproduce mid-node splits
 * on subsequent recomputes.
 */
export function getPageAnchorInfo(editor: Editor): PageAnchorInfo[] {
    const state = paginationKey.getState(editor.state) as PaginationState | undefined;
    if (!state) return [{ anchorId: PAGE_ONE_KEY }];
    const out: PageAnchorInfo[] = [{ anchorId: PAGE_ONE_KEY }];
    for (const b of state.breaks) {
        if (!b.anchorId) continue;
        const entry: PageAnchorInfo = { anchorId: b.anchorId };
        if (b.splitOffset != null) entry.splitOffset = b.splitOffset;
        out.push(entry);
    }
    return out;
}

/**
 * Force a pagination recompute. Call when the page-lock map or the
 * page-locking toggle changes — layout may shift even though the
 * document content did not.
 */
export function refreshPageLocking(editor: Editor | null): void {
    if (!editor || !editor.view) return;
    const tr = editor.state.tr;
    tr.setMeta("forcePaginationUpdate", true);
    tr.setMeta("addToHistory", false);
    editor.view.dispatch(tr);
}
