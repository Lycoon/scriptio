import { DOMSerializer } from "@node_modules/prosemirror-model/dist";
import { CircularBuffer } from "@src/lib/utils/circular-buffer";
import { ScreenplayElement } from "@src/lib/utils/enums";
import { Editor, Extension } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { compareTokens, computeSceneLabels, SceneToken } from "@src/lib/screenplay/scene-locking";
import { PAGE_ONE_KEY, PersistentPageMap } from "@src/lib/screenplay/page-locking";

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
    headerRight: string;
}
export interface FooterOptions {
    footerLeft: string;
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
    headerRight: string;
    footerLeft: string;
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
}

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        Pagination: {
            updatePageSize: (size: Partial<PageSize>) => ReturnType;
            updatePageHeight: (height: number) => ReturnType;
            updatePageWidth: (width: number) => ReturnType;
            updatePageGap: (gap: number) => ReturnType;
            updateMargins: (margins: { top: number; bottom: number; left: number; right: number }) => ReturnType;
            updateHeaderContent: (left: string, right: string, pageNumber?: PageNumber) => ReturnType;
            updateFooterContent: (left: string, right: string, pageNumber?: PageNumber) => ReturnType;
            updatePageBreakBackground: (color: string) => ReturnType;
            updateStartNewPageTypes: (types: Set<string>) => ReturnType;
            refreshPagination: () => ReturnType;
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
    headerRight: "",
    footerLeft: "",
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

// ---------------------------------------------------------------------------
// Decoration builders
// ---------------------------------------------------------------------------

function renderHeader(pagenum: number, label: string, options: PaginationOptions): string {
    const custom = options.customHeader[pagenum];
    const left = custom?.headerLeft ?? options.headerLeft;
    const right = (custom?.headerRight ?? options.headerRight).replace("{page}", label);
    if (!left && !right) return "";
    return (
        `<span class="pagination-header-left">${left}</span>` + `<span class="pagination-header-right">${right}</span>`
    );
}

function renderFooter(pagenum: number, label: string, options: PaginationOptions): string {
    const custom = options.customFooter[pagenum];
    const left = custom?.footerLeft ?? options.footerLeft;
    const right = (custom?.footerRight ?? options.footerRight).replace("{page}", label);
    if (!left && !right) return "";
    return (
        `<span class="pagination-footer-left">${left}</span>` + `<span class="pagination-footer-right">${right}</span>`
    );
}

function createFirstPageWidget(firstPageLabel: string, options: PaginationOptions): HTMLElement {
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
    headerArea.innerHTML = renderHeader(1, firstPageLabel, options);

    overlay.appendChild(headerArea);
    container.appendChild(spacer);
    container.appendChild(overlay);
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

function createPageBreakWidget(breakInfo: PageBreakInfo, options: PaginationOptions): HTMLElement {
    const container = document.createElement("div");
    container.className = "pagination-page-break";
    container.contentEditable = "false";

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
    const spacer = document.createElement("div");
    spacer.className = "pagination-spacer";
    spacer.style.height = `${spacerHeight}px`;

    // Overlay: sits on top of the spacer (top:0, same height).
    // Uses flex justify-content:flex-end so footer/divider/header are pushed to the bottom.
    // The remaining space at the top is the freespace zone, covered by the overlay's background.
    const overlay = document.createElement("div");
    overlay.className = "pagination-overlay";
    overlay.style.top = "0";
    overlay.style.height = `${spacerHeight}px`;

    // For mid-node splits, the widget is inserted inside a padded <p> element.
    // The overlay's position:absolute is relative to the container, which is bounded
    // by the <p>'s content area — so left:0/right:0 only reaches the text column edges,
    // not the page edges. We escape the parent padding by negating it with the same CSS
    // variables that define the node type's padding, restoring full-page coverage.
    if (breakInfo.splitNodeType !== null) {
        const [leftVar, rightVar] = getSplitPaddingVars(breakInfo.splitNodeType);
        overlay.style.left = `calc(-1 * ${leftVar})`;
        overlay.style.right = `calc(-1 * ${rightVar})`;
    }

    // Labels for the surrounding pages. Defaults preserve legacy behavior
    // (pagenum-1 / pagenum) when no labels were assigned (page locking off).
    const prevLabel = breakInfo.prevLabel ?? String(breakInfo.pagenum - 1);
    const thisLabel = breakInfo.label ?? String(breakInfo.pagenum);

    // Footer area of the ending page (fixed size = marginBottom)
    const footerArea = document.createElement("div");
    footerArea.className = "pagination-footer-area";
    footerArea.style.height = `${options.marginBottom}px`;
    footerArea.innerHTML = renderFooter(breakInfo.pagenum - 1, prevLabel, options);

    // Visual gap between pages (fixed size = pageGap)
    const divider = document.createElement("div");
    divider.className = "pagination-divider";
    divider.style.height = `${options.pageGap}px`;
    divider.style.backgroundColor = "var(--main-bg)";

    // Header area of the new page (fixed size = marginTop)
    const headerArea = document.createElement("div");
    headerArea.className = "pagination-header-area";
    headerArea.style.height = `${options.marginTop}px`;
    headerArea.innerHTML = renderHeader(breakInfo.pagenum, thisLabel, options);

    overlay.appendChild(footerArea);
    overlay.appendChild(divider);
    overlay.appendChild(headerArea);

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

    container.appendChild(spacer);
    container.appendChild(overlay);
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
    footerArea.innerHTML = renderFooter(pagenum, label, options);

    overlay.appendChild(footerArea);
    container.appendChild(spacer);
    container.appendChild(overlay);
    return container;
}

function buildDecorations(
    doc: Node,
    breaks: PageBreakInfo[],
    lastPageFreespace: number,
    firstPageLabel: string,
    options: PaginationOptions,
): DecorationSet {
    const decorations: Decoration[] = [];

    // First page top margin / header
    decorations.push(
        Decoration.widget(0, createFirstPageWidget(firstPageLabel, options), {
            side: -1,
            key: `page-1-header-${firstPageLabel}`,
        }),
    );

    // Page breaks
    // The key MUST include every value that affects the widget DOM (freespace,
    // contdName, splitNodeType, label, isEmpty) — not just pagenum.  ProseMirror's
    // WidgetType.eq short-circuits on matching keys and reuses the old DOM element,
    // so a key that omits e.g. freespace causes stale spacer heights after content edits.
    for (const b of breaks) {
        decorations.push(
            Decoration.widget(b.pos, createPageBreakWidget(b, options), {
                side: -1,
                key: `pb-${b.pagenum}-${b.freespace}-${b.contdName}-${b.splitNodeType}-${b.label ?? ""}-${b.prevLabel ?? ""}-${b.isEmpty ? "E" : ""}`,
            }),
        );
    }

    // Last page bottom margin / footer.
    // Label of the last page = label of the most recent break (or firstPageLabel
    // when no breaks exist).
    const lastPagenum = breaks.length > 0 ? breaks[breaks.length - 1].pagenum : 1;
    const lastPageLabel = breaks.length > 0
        ? breaks[breaks.length - 1].label ?? String(lastPagenum)
        : firstPageLabel;
    decorations.push(
        Decoration.widget(
            doc.content.size,
            createLastPageWidget(lastPagenum, lastPageLabel, lastPageFreespace, options),
            {
                side: 1,
                key: `lp-${lastPagenum}-${lastPageLabel}-${lastPageFreespace}`,
            },
        ),
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
    /** Rendered height of the portion staying on the current page. */
    topHeight: number;
    /** Rendered height of the portion moving to the next page. */
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
            // Measure the bottom half to guard against a degenerate single-line remainder.
            const bottomText = sentences.slice(i + 1).join("");
            const bottomElement = nodeElement.cloneNode(false) as HTMLElement;
            bottomElement.textContent = bottomText;
            const bottomHeight = getHTMLHeight(bottomElement, editorDOM, node.type.name, options);

            // Bottom too short — not worth a split; force the whole node to the next page.
            if (bottomHeight < LINE_HEIGHT * MIN_SPLIT_BOTTOM_LINES) return null;

            // The split position in document space:
            // nodeDocPos + 1 skips the node's opening token; topText.length then walks
            // through the text characters (marks are zero-width in ProseMirror's position space).
            return { pos: nodeDocPos + 1 + topText.length, topHeight, bottomHeight };
        }
    }

    // No prefix fits — the first sentence alone is too tall; move the whole node.
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
): string[] {
    const anchors: string[] = [PAGE_ONE_KEY];
    for (const b of breaks) {
        // Empty pages anchor to the orphan lock's anchorId. Real pages anchor
        // to the data-id of the top-level node where the page starts. If
        // anchorId is somehow missing, fall back to a unique synthetic key
        // so the label-computer still produces a usable result.
        anchors.push(b.anchorId ?? `__break_${b.pos}_${b.pagenum}__`);
    }
    const labels = computeSceneLabels(anchors, pageLocks, "suffix", skippedLetters);
    return labels.map((l) => l.label);
}

const createPaginationPlugin = (extension: { options: PaginationOptions; editor: Editor }) =>
    new Plugin({
        key: paginationKey,
        state: {
            init: (): PaginationState => ({
                decset: DecorationSet.empty,
                breaks: [],
                lastPageFreespace: 0,
                firstPageLabel: "1",
            }),
            apply(tr, value: PaginationState, oldState, newState): PaginationState {
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

                const serializer = DOMSerializer.fromSchema(newState.schema);

                // --- Page-lock setup ---
                // Hot-path discipline: when locking is off (the common case),
                // pageLocks/lockedAnchorIds stay null and the per-node check
                // short-circuits on the first `&&` — zero allocations, zero
                // map lookups. The set is rebuilt once per pass when locking
                // is active; lock counts are typically tens, never thousands.
                const pageLocking = options.getPageLocking?.() ?? false;
                const pageLocks: PersistentPageMap | null = pageLocking
                    ? options.getPageLocks?.() ?? null
                    : null;
                const lockedAnchorIds: Set<string> | null = pageLocks
                    ? new Set(Object.keys(pageLocks).filter((k) => k !== PAGE_ONE_KEY))
                    : null;
                const skippedLetters = options.getSkippedLetters?.() ?? [];

                const contentHeight = options.pageHeight - options.marginTop - options.marginBottom;
                const breaks: PageBreakInfo[] = [];
                let pagePos = 0;
                let pagenum = 1;
                const childCount = newState.doc.childCount;
                let offset = 0;

                // Tracks the most recent Character cue text so we can label split-dialogue breaks
                // with "CHARACTER (CONT'D)" on the next page.
                let lastCharName = "";

                let lastNodes: CircularBuffer<NodeInfo> = new CircularBuffer(3);
                for (let i = 0; i < childCount; i++) {
                    const node = newState.doc.child(i);
                    const pos = offset;
                    offset += node.nodeSize;

                    if (!("height" in node.attrs)) continue;

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

                    // --- Force page break for "start new page" elements ---
                    // If this node type is configured to start a new page and we're
                    // not already at the top of a page, insert a break before it.
                    if (options.startNewPageTypes.has(nodeType) && pagePos > 0) {
                        const freespace = contentHeight - pagePos;
                        breaks.push({
                            pos,
                            pagenum: ++pagenum,
                            freespace: Math.max(0, freespace),
                            contdName: "",
                            splitNodeType: null,
                            anchorId: dataId,
                        });
                        pagePos = 0;
                        lastNodes = new CircularBuffer(3);
                    }

                    // --- Force page break for locked page anchors ---
                    // O(1) Set.has when locking is on; the leading `lockedAnchorIds &&`
                    // short-circuits to false when locking is disabled — hot-path safe.
                    if (lockedAnchorIds && dataId && pagePos > 0 && lockedAnchorIds.has(dataId)) {
                        const freespace = contentHeight - pagePos;
                        breaks.push({
                            pos,
                            pagenum: ++pagenum,
                            freespace: Math.max(0, freespace),
                            contdName: "",
                            splitNodeType: null,
                            anchorId: dataId,
                        });
                        pagePos = 0;
                        lastNodes = new CircularBuffer(3);
                    }

                    // Accumulate height on current page
                    pagePos += height;

                    // We keep the last 3 nodes for orphan resolution on page break
                    lastNodes.push({ pos, type: nodeType, height, positionTop: pagePos - height, dataId });

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

                            const split = trySplitNode(node, pos, freespaceBeforeNode, element, editorDOM, options);
                            if (split) {
                                breaks.push({
                                    pos: split.pos,
                                    pagenum: ++pagenum,
                                    freespace: Math.max(0, freespaceBeforeNode - split.topHeight),
                                    // contdName non-empty for dialogue: triggers (MORE)/(CONT'D) labels.
                                    contdName: logic.showMoreContd ? lastCharName : "",
                                    // splitNodeType drives the overlay padding-escape in createPageBreakWidget.
                                    splitNodeType: nodeType,
                                    // Anchor for page locking: the node being split owns both halves.
                                    anchorId: dataId,
                                });
                                // The bottom half of the split node is the first item on the new page.
                                pagePos = split.bottomHeight;
                                lastNodes = new CircularBuffer(3);
                                lastNodes.push({ pos, type: nodeType, height: split.bottomHeight, positionTop: 0, dataId });
                                continue; // split handled — skip orphan resolution for this node
                            }
                        }

                        // --- Orphan resolution ---
                        // Walk back through the buffer: if the last fitted node has keepWithNext,
                        // slide the break back to its position (and carry its height to the next page).
                        // Repeat once more for the double-orphan case (e.g. Character → Parenthetical).
                        let breakPos = pos;
                        let carryHeight = height; // cumulative height that moves to the next page
                        let backCount = 0; // how many nodes slid back

                        for (let back = 1; back <= 2; back++) {
                            const prev = lastNodes.at(back); // at(1) = last fitted, at(2) = one before
                            if (!prev) break;
                            // A locked anchor owns its page and must never be displaced by
                            // walkback — otherwise the next overflow would yank it onto an
                            // A page and the locked frame would lose its head.
                            if (
                                lockedAnchorIds &&
                                prev.dataId &&
                                lockedAnchorIds.has(prev.dataId)
                            ) {
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
                        // lastNodes.at(backCount) is that first node; positionTop is its accumulated
                        // page height just before it was added — i.e. the used space above it.
                        const firstMovingNode = lastNodes.at(backCount);
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
                            freespace: Math.max(0, freespace),
                            contdName: isDialogueSplit ? lastCharName : "",
                            splitNodeType: null,
                            anchorId: anchorDataId,
                        };
                        breaks.push(breakInfo);
                        pagenum++;
                        pagePos = carryHeight;

                        // positionTop values in the buffer are page-relative — reset and re-seed
                        // with the carry nodes using new-page positionTop values so orphan checking
                        // works correctly on the next break.
                        const carryNodes: NodeInfo[] = [];
                        let carryTop = 0;
                        for (let back = backCount; back >= 0; back--) {
                            const n = lastNodes.at(back)!;
                            carryNodes.push({ ...n, positionTop: carryTop });
                            carryTop += n.height;
                        }
                        lastNodes = new CircularBuffer(3);
                        for (const n of carryNodes) lastNodes.push(n);

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
                let lastPageFreespace = Math.max(0, contentHeight - pagePos);

                // --- Orphan page handling ---
                // A locked page whose anchor data-id is no longer present in the doc
                // becomes an "orphan" — we insert a synthetic empty-page break so the
                // page still appears in the layout (preserving its locked number).
                // Orphans are placed at the doc position of the next surviving lock
                // (or doc end) and consume a full content-height of vertical space.
                if (pageLocks) {
                    const seenAnchors = new Set<string>();
                    for (const b of breaks) {
                        if (b.anchorId) seenAnchors.add(b.anchorId);
                    }

                    // Tokens for ordered comparison. Provisional pages (no token in
                    // the lock map) aren't relevant here — only locked entries can be
                    // orphans. We need the orphan list in TOKEN order so insertions
                    // happen at the right spots.
                    type OrphanEntry = { anchorId: string; token: SceneToken };
                    const orphans: OrphanEntry[] = [];
                    for (const [anchorId, page] of Object.entries(pageLocks)) {
                        if (anchorId === PAGE_ONE_KEY) continue;
                        if (!page?.token) continue;
                        if (seenAnchors.has(anchorId)) continue;
                        orphans.push({ anchorId, token: page.token });
                    }

                    if (orphans.length > 0) {
                        // Build an ordered list of live-locked anchors keyed by token,
                        // so we can find the "next live lock after orphan X" quickly.
                        type LiveLock = { anchorId: string; token: SceneToken; pos: number };
                        const liveLocks: LiveLock[] = [];
                        for (const b of breaks) {
                            if (!b.anchorId) continue;
                            const lock = pageLocks[b.anchorId];
                            if (lock?.token) liveLocks.push({ anchorId: b.anchorId, token: lock.token, pos: b.pos });
                        }
                        liveLocks.sort((a, b) => compareTokens(a.token, b.token));
                        orphans.sort((a, b) => compareTokens(a.token, b.token));

                        const docSize = newState.doc.content.size;

                        for (const orphan of orphans) {
                            // Token-gap segment this orphan belongs in: bounded by the
                            // greatest live lock with a smaller token (prev) and the
                            // smallest live lock with a larger token (next). Positions
                            // of those bounding locks define the doc-position window
                            // where this orphan can be slotted in.
                            let prevLive: LiveLock | null = null;
                            let nextLive: LiveLock | null = null;
                            for (const l of liveLocks) {
                                if (compareTokens(l.token, orphan.token) < 0) {
                                    if (!prevLive || compareTokens(prevLive.token, l.token) < 0) {
                                        prevLive = l;
                                    }
                                } else if (compareTokens(l.token, orphan.token) > 0) {
                                    if (!nextLive || compareTokens(l.token, nextLive.token) < 0) {
                                        nextLive = l;
                                    }
                                }
                            }
                            const segmentStart = prevLive?.pos ?? 0;
                            const segmentEnd = nextLive?.pos ?? docSize;

                            // First try to consume an existing provisional break inside
                            // this segment. That break is the natural overflow from the
                            // previous page — by re-anchoring it to the orphan, we make
                            // the overflow content flow INTO the empty deleted-page slot
                            // (Final Draft-style) instead of producing a phantom A page
                            // alongside a separately-rendered empty page.
                            let consumed = false;
                            for (let j = 0; j < breaks.length; j++) {
                                const b = breaks[j];
                                if (b.pos < segmentStart) continue;
                                if (b.pos >= segmentEnd) break;
                                const bLock = b.anchorId ? pageLocks[b.anchorId] : undefined;
                                if (bLock?.token) continue; // already a locked break — skip
                                // Provisional in the orphan's segment: reassign anchorId
                                // so the label flips from "NA" to the orphan's frozen label.
                                b.anchorId = orphan.anchorId;
                                liveLocks.push({
                                    anchorId: orphan.anchorId,
                                    token: orphan.token,
                                    pos: b.pos,
                                });
                                liveLocks.sort((a, b) => compareTokens(a.token, b.token));
                                consumed = true;
                                break;
                            }

                            if (consumed) continue;

                            // No provisional to absorb the orphan — fall back to a
                            // synthetic empty-page break at the segment's end position.
                            //
                            // Insert index walks the breaks list. We want the synthetic
                            // to land at segmentEnd, AFTER any break at the same pos
                            // whose token is smaller (so multiple orphans at one
                            // segmentEnd line up in token order: orphan-2, orphan-3,
                            // then the live lock that bounds the segment).
                            let insertIdx = breaks.length;
                            for (let j = 0; j < breaks.length; j++) {
                                const b = breaks[j];
                                if (b.pos > segmentEnd) {
                                    insertIdx = j;
                                    break;
                                }
                                if (b.pos === segmentEnd) {
                                    const bLock = b.anchorId ? pageLocks[b.anchorId] : undefined;
                                    if (
                                        bLock?.token &&
                                        compareTokens(orphan.token, bLock.token) < 0
                                    ) {
                                        insertIdx = j;
                                        break;
                                    }
                                }
                            }

                            // Freespace transfer: the synthetic empty page's widget
                            // renders the prev→empty transition (footer of previous
                            // page + chrome + empty content area). For the previous
                            // page to keep its full height, the synthetic must absorb
                            // its bottom freespace. That freespace currently lives on
                            // the break that the synthetic is being inserted BEFORE
                            // (either a lock force-break at the same pos, or the last-
                            // page widget at doc end). Transfer it, then zero out the
                            // donor — its "previous page" is now the empty synthetic,
                            // which already gets a full `contentHeight` slot, so no
                            // additional freespace is needed there.
                            let syntheticFreespace = 0;
                            if (
                                insertIdx < breaks.length &&
                                breaks[insertIdx].pos === segmentEnd
                            ) {
                                syntheticFreespace = breaks[insertIdx].freespace;
                                breaks[insertIdx].freespace = 0;
                            } else if (insertIdx === breaks.length) {
                                // Doc end — the synthetic is the new "last empty page",
                                // and the existing last-page widget would have padded
                                // out the freespace below the previous real page.
                                // Transfer that to the synthetic.
                                syntheticFreespace = lastPageFreespace;
                                lastPageFreespace = 0;
                            }

                            const synthetic: PageBreakInfo = {
                                pos: segmentEnd,
                                pagenum: 0, // re-numbered below
                                freespace: syntheticFreespace,
                                contdName: "",
                                splitNodeType: null,
                                anchorId: orphan.anchorId,
                                isEmpty: true,
                            };
                            breaks.splice(insertIdx, 0, synthetic);
                            liveLocks.push({
                                anchorId: orphan.anchorId,
                                token: orphan.token,
                                pos: segmentEnd,
                            });
                            liveLocks.sort((a, b) => compareTokens(a.token, b.token));
                        }

                        // Renumber pagenums after insertions (synthetic breaks have pagenum: 0).
                        for (let i = 0; i < breaks.length; i++) {
                            breaks[i].pagenum = i + 2; // page 1 has no break; first break starts page 2.
                        }
                    }
                }

                // --- Label assignment ---
                // Run computeSceneLabels over [page1Anchor, ...breakAnchors] so locked
                // pages keep their frozen labels, provisional inserts get suffix labels
                // (e.g. "4A"), and pages past the last lock continue the integer sequence.
                let firstPageLabel = "1";
                if (pageLocks) {
                    const labels = computePageLabels(breaks, pageLocks, skippedLetters);
                    firstPageLabel = labels[0];
                    for (let i = 0; i < breaks.length; i++) {
                        const label = labels[i + 1];
                        const prevLabel = labels[i];
                        breaks[i].label = label;
                        breaks[i].prevLabel = prevLabel;
                    }
                }

                // Check if breaks actually changed compared to mapped old breaks.
                const breaksChanged =
                    fullRemeasure ||
                    lastPageFreespace !== value.lastPageFreespace ||
                    firstPageLabel !== value.firstPageLabel ||
                    breaks.length !== mappedOldBreaks.length ||
                    breaks.some(
                        (b, i) =>
                            b.pos !== mappedOldBreaks[i].pos ||
                            b.freespace !== mappedOldBreaks[i].freespace ||
                            b.contdName !== mappedOldBreaks[i].contdName ||
                            b.label !== mappedOldBreaks[i].label ||
                            b.prevLabel !== mappedOldBreaks[i].prevLabel ||
                            !!b.isEmpty !== !!mappedOldBreaks[i].isEmpty,
                    );

                const decset = breaksChanged
                    ? buildDecorations(newState.doc, breaks, lastPageFreespace, firstPageLabel, options)
                    : value.decset.map(tr.mapping, tr.doc);

                return { decset, breaks, lastPageFreespace, firstPageLabel };
            },
        },
        appendTransaction() {
            return null;
        },
        props: {
            decorations(state) {
                return (paginationKey.getState(state) as PaginationState)?.decset ?? DecorationSet.empty;
            },
        },
    });

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export const ScriptioPagination = Extension.create<PaginationOptions>({
    name: "Pagination",

    addOptions() {
        return defaultOptions;
    },

    addStorage() {
        return { initTimer: null as ReturnType<typeof setTimeout> | null };
    },

    onCreate() {
        const editorDOM = this.editor.view.dom;

        editorDOM.classList.add("pagination");
        syncVars(editorDOM, this.options);

        let style = document.getElementById("pagination-style");
        if (!style) {
            style = document.createElement("style");
            style.id = "pagination-style";
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
                .pagination-footer-left {
                    text-align: left;
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
            `;
            document.head.appendChild(style);
        }

        setupTestDiv(editorDOM, this.options);

        // Trigger initial pagination after editor is ready
        this.storage.initTimer = setTimeout(() => {
            this.storage.initTimer = null;
            const tr = this.editor.state.tr;
            tr.setMeta("forcePaginationUpdate", true);
            tr.setMeta("addToHistory", false);
            this.editor.view.dispatch(tr);
        }, 0);
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
                (l, r, p) =>
                ({ tr }) => {
                    if (p !== undefined) this.options.customHeader[p] = { headerLeft: l, headerRight: r };
                    else {
                        this.options.headerLeft = l;
                        this.options.headerRight = r;
                    }
                    tr.setMeta("forcePaginationUpdate", true);
                    return true;
                },
            updateFooterContent:
                (l, r, p) =>
                ({ tr }) => {
                    if (p !== undefined) this.options.customFooter[p] = { footerLeft: l, footerRight: r };
                    else {
                        this.options.footerLeft = l;
                        this.options.footerRight = r;
                    }
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
