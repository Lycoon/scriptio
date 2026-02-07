/**
 * Patched version of tiptap-pagination-plus
 *
 * Performance optimizations:
 * 1. Skip expensive calculatePageCount() for simple text edits
 * 2. Debounce view.update() calculations with requestAnimationFrame
 * 3. Cache page count to avoid redundant recalculations
 *
 * Original source: node_modules/tiptap-pagination-plus/dist/PaginationPlus.js
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReplaceAroundStep } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/core";

// Re-export PAGE_SIZES from the original package for convenience
export { PAGE_SIZES } from "tiptap-pagination-plus";

// ============================================================================
// Utils (copied from tiptap-pagination-plus/dist/utils.js)
// ============================================================================

const updateCssVariables = (targetNode: HTMLElement, config: PaginationPlusOptions) => {
    const cssVariables: Record<string, string> = {
        "rm-page-height": `${config.pageHeight}px`,
        "rm-margin-top": `${config.marginTop}px`,
        "rm-margin-bottom": `${config.marginBottom}px`,
        "rm-margin-left": `${config.marginLeft}px`,
        "rm-margin-right": `${config.marginRight}px`,
        "rm-content-margin-top": `${config.contentMarginTop}px`,
        "rm-content-margin-bottom": `${config.contentMarginBottom}px`,
        "rm-page-gap-border-color": `${config.pageGapBorderColor}`,
        "rm-page-width": `${config.pageWidth}px`,
    };
    Object.entries(cssVariables).forEach(([key, value]) => {
        targetNode.style.setProperty(`--${key}`, value);
    });
};

// Performance: Cache for header/footer heights to avoid repeated DOM queries
let cachedHeaderHeight: Map<number, number> | null = null;
let cachedFooterHeight: Map<number, number> | null = null;
let heightCacheFrame: number | null = null;

// Invalidate height cache at the start of next frame
function invalidateHeightCache() {
    if (heightCacheFrame === null) {
        heightCacheFrame = requestAnimationFrame(() => {
            cachedHeaderHeight = null;
            cachedFooterHeight = null;
            heightCacheFrame = null;
        });
    }
}

const getHeaderHeight = (
    targetNode: HTMLElement,
    pageNumbers: number[],
    type: "actual" | "content",
): Map<number, number> => {
    // Return cached value if available (within same frame)
    if (cachedHeaderHeight !== null) return cachedHeaderHeight;

    const headerHeightMap = new Map<number, number>();
    const selector = type === "actual" ? ".rm-page-header-0" : ".rm-page-header-0 .rm-page-header-content";
    const clientHeader = targetNode.querySelector(selector);
    // Use offsetHeight instead of clientHeight - same value but may be more consistently cached
    headerHeightMap.set(0, clientHeader ? (clientHeader as HTMLElement).offsetHeight : 0);
    pageNumbers.forEach((pageNumber) => {
        const pageSelector =
            type === "actual"
                ? `.rm-page-header-${pageNumber}`
                : `.rm-page-header-${pageNumber} .rm-page-header-content`;
        const clientHeaderEl = targetNode.querySelector(pageSelector);
        const headerHeight = clientHeaderEl ? (clientHeaderEl as HTMLElement).offsetHeight : 0;
        headerHeightMap.set(pageNumber, headerHeight);
    });
    cachedHeaderHeight = headerHeightMap;
    return headerHeightMap;
};

const getFooterHeight = (
    targetNode: HTMLElement,
    pageNumbers: number[],
    type: "actual" | "content",
): Map<number, number> => {
    // Return cached value if available (within same frame)
    if (cachedFooterHeight !== null) return cachedFooterHeight;

    const footerHeightMap = new Map<number, number>();
    const selector = type === "actual" ? ".rm-page-footer-0" : ".rm-page-footer-0 .rm-page-footer-content";
    const clientFooter = targetNode.querySelector(selector);
    // Use offsetHeight instead of clientHeight - same value but may be more consistently cached
    footerHeightMap.set(0, clientFooter ? (clientFooter as HTMLElement).offsetHeight : 0);
    pageNumbers.forEach((pageNumber) => {
        const pageSelector =
            type === "actual"
                ? `.rm-page-footer-${pageNumber}`
                : `.rm-page-footer-${pageNumber} .rm-page-footer-content`;
        const clientFooterEl = targetNode.querySelector(pageSelector);
        const footerHeight = clientFooterEl ? (clientFooterEl as HTMLElement).offsetHeight : 0;
        footerHeightMap.set(pageNumber, footerHeight);
    });
    cachedFooterHeight = footerHeightMap;
    return footerHeightMap;
};

function deepEqualIterative(a: any, b: any): boolean {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a == null || b == null) {
        return false;
    }
    const stack: Array<{ x: any; y: any }> = [{ x: a, y: b }];
    while (stack.length) {
        const _stackItem = stack.pop();
        if (!_stackItem) continue;
        const { x, y } = _stackItem;
        if (x === y) continue;
        if (typeof x !== typeof y) return false;
        if (typeof x !== "object") return false;
        if (x == null || y == null) return false;
        const xKeys = Object.keys(x);
        const yKeys = Object.keys(y);
        if (xKeys.length !== yKeys.length) return false;
        for (const key of xKeys) {
            if (!(key in y)) return false;
            const xVal = x[key];
            const yVal = y[key];
            if (xVal === yVal) continue;
            if (typeof xVal === "object" && typeof yVal === "object") {
                stack.push({ x: xVal, y: yVal });
            } else {
                if (xVal !== yVal) return false;
            }
        }
    }
    return true;
}

function getCustomPages(customHeader: Record<number, HeaderOptions>, customFooter: Record<number, FooterOptions>): number[] {
    return [...Object.keys(customHeader), ...Object.keys(customFooter)].map(Number);
}

function getFooter(
    footerRightContent: string,
    footerLeftContent: string,
    onFooterClick: (event: MouseEvent) => void,
    pageNumber?: number,
): HTMLDivElement {
    const pageFooter = document.createElement("div");
    pageFooter.classList.add("rm-page-footer");
    pageFooter.classList.add(`rm-page-footer-${pageNumber ? pageNumber : 0}`);
    pageFooter.style.overflow = "visible";
    pageFooter.style.position = "relative";
    pageFooter.style.cursor = "pointer";
    const pageFooterContent = document.createElement("div");
    pageFooterContent.classList.add("rm-page-footer-content");
    pageFooterContent.style.width = "100%";
    pageFooterContent.style.overflow = "hidden";
    const footerRight = footerRightContent.replace("{page}", `<span class="rm-page-number"></span>`);
    const footerLeft = footerLeftContent.replace("{page}", `<span class="rm-page-number"></span>`);
    const pageFooterLeft = document.createElement("div");
    pageFooterLeft.classList.add("rm-page-footer-left");
    pageFooterLeft.innerHTML = footerLeft;
    const pageFooterRight = document.createElement("div");
    pageFooterRight.classList.add("rm-page-footer-right");
    pageFooterRight.innerHTML = footerRight;
    pageFooterContent.appendChild(pageFooterLeft);
    pageFooterContent.appendChild(pageFooterRight);
    pageFooter.appendChild(pageFooterContent);
    pageFooter.addEventListener("click", onFooterClick);
    return pageFooter;
}

function getHeader(
    headerRightContent: string,
    headerLeftContent: string,
    onHeaderClick: (event: MouseEvent) => void,
    pageNumber?: number,
): HTMLDivElement {
    const pageHeader = document.createElement("div");
    pageHeader.classList.add("rm-page-header");
    pageHeader.classList.add(`rm-page-header-${pageNumber ? pageNumber : 0}`);
    pageHeader.style.overflow = "hidden";
    pageHeader.style.cursor = "pointer";
    pageHeader.style.position = "relative";
    const pageHeaderContent = document.createElement("div");
    pageHeaderContent.classList.add("rm-page-header-content");
    pageHeaderContent.style.width = "100%";
    pageHeaderContent.style.overflow = "hidden";
    const headerLeft = headerLeftContent.replace("{page}", `<span class="rm-page-number-plus"></span>`);
    const headerRight = headerRightContent.replace("{page}", `<span class="rm-page-number-plus"></span>`);
    const pageHeaderLeft = document.createElement("div");
    pageHeaderLeft.classList.add("rm-page-header-left");
    pageHeaderLeft.innerHTML = headerLeft;
    const pageHeaderRight = document.createElement("div");
    pageHeaderRight.classList.add("rm-page-header-right");
    pageHeaderRight.innerHTML = headerRight;
    pageHeaderContent.appendChild(pageHeaderLeft);
    pageHeaderContent.appendChild(pageHeaderRight);
    pageHeader.appendChild(pageHeaderContent);
    pageHeader.addEventListener("click", onHeaderClick);
    return pageHeader;
}

const getHeight = (
    pageOptions: PaginationPlusOptions,
    _headerHeight: number,
    _footerHeight: number,
) => {
    const _pageHeaderHeight = pageOptions.contentMarginTop + pageOptions.marginTop + _headerHeight;
    const _pageFooterHeight = pageOptions.contentMarginBottom + pageOptions.marginBottom + _footerHeight;
    const _pageHeight = pageOptions.pageHeight - _pageHeaderHeight - _pageFooterHeight;
    return {
        _pageHeaderHeight,
        _pageFooterHeight,
        _pageHeight,
    };
};

const headerClickEvent = (pageNumber: number, onHeaderClick?: HeaderClickEvent) => {
    return (event: MouseEvent) => {
        onHeaderClick?.({
            event: event,
            pageNumber: pageNumber,
        });
    };
};

const footerClickEvent = (pageNumber: number, onFooterClick?: FooterClickEvent) => {
    return (event: MouseEvent) => {
        onFooterClick?.({
            event: event,
            pageNumber: pageNumber,
        });
    };
};

// ============================================================================
// Types
// ============================================================================

type HeaderOptions = { headerLeft?: string; headerRight?: string };
type FooterOptions = { footerLeft?: string; footerRight?: string };
type RequiredHeaderOptions = { headerLeft: string; headerRight: string };
type RequiredFooterOptions = { footerLeft: string; footerRight: string };
type PageNumber = number;
type HeaderClickEvent = (data: { event: MouseEvent; pageNumber: number }) => void;
type FooterClickEvent = (data: { event: MouseEvent; pageNumber: number }) => void;

export interface PaginationPlusOptions {
    pageHeight: number;
    pageWidth: number;
    pageGap: number;
    pageBreakBackground: string;
    pageGapBorderSize: number;
    footerRight: string;
    footerLeft: string;
    headerRight: string;
    headerLeft: string;
    customHeader: Record<PageNumber, HeaderOptions>;
    customFooter: Record<PageNumber, FooterOptions>;
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    contentMarginTop: number;
    contentMarginBottom: number;
    pageGapBorderColor: string;
    onHeaderClick?: HeaderClickEvent;
    onFooterClick?: FooterClickEvent;
}

interface PaginationPlusStorage extends PaginationPlusOptions {
    headerHeight: Map<number, number>;
    footerHeight: Map<number, number>;
}

// ============================================================================
// Module-level state for debouncing (PERFORMANCE OPTIMIZATION)
// ============================================================================

let pendingViewUpdate: number | null = null;
let lastCalculatedPageCount: number | null = null;

// ============================================================================
// Constants & Keys
// ============================================================================

const page_count_meta_key = "PAGE_COUNT_META_KEY";
const paginationKey = new PluginKey("pagination");
const brDecorationKey = new PluginKey("brDecoration");

// ============================================================================
// Helper functions
// ============================================================================

function buildDecorations(doc: any): DecorationSet {
    const decorations: Decoration[] = [];
    doc.descendants((node: any, pos: number) => {
        if (node.type.name === "hardBreak") {
            const afterPos = pos + 1;
            const widget = Decoration.widget(afterPos, () => {
                const el = document.createElement("span");
                el.classList.add("rm-br-decoration");
                return el;
            });
            decorations.push(widget);
        }
    });
    return DecorationSet.create(doc, decorations);
}

const defaultOptions: PaginationPlusOptions = {
    pageHeight: 800,
    pageWidth: 789,
    pageGap: 50,
    pageGapBorderSize: 1,
    pageBreakBackground: "#ffffff",
    footerRight: "{page}",
    footerLeft: "",
    headerRight: "",
    headerLeft: "",
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 50,
    marginRight: 50,
    contentMarginTop: 10,
    contentMarginBottom: 10,
    pageGapBorderColor: "#e5e5e5",
    customHeader: {},
    customFooter: {},
};

const refreshPage = (targetNode: HTMLElement) => {
    const paginationElement = targetNode.querySelector("[data-rm-pagination]");
    if (paginationElement) {
        const lastPageBreak = paginationElement.lastElementChild?.querySelector(".breaker") as HTMLElement | null;
        if (lastPageBreak) {
            const minHeight = lastPageBreak.offsetTop + lastPageBreak.offsetHeight;
            targetNode.style.minHeight = `calc(${minHeight}px + 2px)`;
        }
    }
};

const safeGetView = (editor: Editor): EditorView | null => {
    try {
        editor.view.dom;
        return editor.view;
    } catch {
        return null;
    }
};

const getExistingPageCount = (view: EditorView): number => {
    const editorDom = view.dom;
    const paginationElement = editorDom.querySelector("[data-rm-pagination]");
    if (paginationElement) {
        return paginationElement.children.length;
    }
    return 0;
};

/**
 * Calculate the number of pages needed based on content height.
 * This is an EXPENSIVE operation that calls getBoundingClientRect().
 */
const calculatePageCount = (
    view: EditorView,
    pageOptions: PaginationPlusOptions,
    headerHeight = 0,
    footerHeight = 0,
): number => {
    const editorDom = view.dom as HTMLElement;
    const _pageHeaderHeight = pageOptions.contentMarginTop + pageOptions.marginTop + headerHeight;
    const _pageFooterHeight = pageOptions.contentMarginBottom + pageOptions.marginBottom + footerHeight;
    const pageContentAreaHeight = pageOptions.pageHeight - _pageHeaderHeight - _pageFooterHeight;
    const paginationElement = editorDom.querySelector("[data-rm-pagination]");
    const currentPageCount = getExistingPageCount(view);

    if (paginationElement) {
        const lastElementOfEditor = editorDom.lastElementChild as HTMLElement | null;
        const lastPageBreak = paginationElement.lastElementChild?.querySelector(".breaker") as HTMLElement | null;

        if (lastElementOfEditor && lastPageBreak) {
            // Performance: Use offset properties instead of getBoundingClientRect()
            // offset* properties are cheaper as they use cached layout values
            const lastElementBottom = lastElementOfEditor.offsetTop + lastElementOfEditor.offsetHeight;
            const breakerParent = lastPageBreak.offsetParent as HTMLElement | null;
            const lastPageBreakBottom = (breakerParent?.offsetTop || 0) + lastPageBreak.offsetTop + lastPageBreak.offsetHeight;
            const lastPageGap = lastElementBottom - lastPageBreakBottom;

            if (lastPageGap > 0) {
                const addPage = Math.ceil(lastPageGap / pageContentAreaHeight);
                return currentPageCount + addPage;
            } else {
                const lpFrom = -10;
                const lpTo = -(pageOptions.pageHeight - 10);
                if (lastPageGap > lpTo && lastPageGap < lpFrom) {
                    return currentPageCount;
                } else if (lastPageGap < lpTo) {
                    const pageHeightOnRemove = pageOptions.pageHeight + pageOptions.pageGap;
                    const removePage = Math.floor(lastPageGap / pageHeightOnRemove);
                    return currentPageCount + removePage;
                } else {
                    return currentPageCount;
                }
            }
        }
        return 1;
    } else {
        const editorHeight = editorDom.scrollHeight;
        let pageCount = Math.ceil(editorHeight / pageContentAreaHeight);
        pageCount = pageCount <= 0 ? 1 : pageCount;
        return pageCount;
    }
};

function createDecoration(
    pageOptions: PaginationPlusOptions,
    headerHeightMap: Map<number, number>,
    footerHeightMap: Map<number, number>,
): Decoration[] {
    const commonHeaderOptions: RequiredHeaderOptions = { headerLeft: pageOptions.headerLeft, headerRight: pageOptions.headerRight };
    const commonFooterOptions: RequiredFooterOptions = { footerLeft: pageOptions.footerLeft, footerRight: pageOptions.footerRight };

    const pageWidget = Decoration.widget(
        0,
        (view) => {
            const _pageGap = pageOptions.pageGap;
            const _pageBreakBackground = pageOptions.pageBreakBackground;
            const el = document.createElement("div");
            el.dataset.rmPagination = "true";

            const pageBreakDefinition = (
                firstPage: boolean,
                pageHeader: HTMLElement,
                pageFooter: HTMLElement,
                headerHeight: number,
                footerHeight: number,
                pageNumber?: number,
            ) => {
                const { _pageHeaderHeight, _pageHeight } = getHeight(pageOptions, headerHeight, footerHeight);
                const pageContainer = document.createElement("div");
                pageContainer.classList.add("rm-page-break");
                const page = document.createElement("div");
                page.classList.add("page");
                page.style.position = "relative";
                page.style.float = "left";
                page.style.clear = "both";
                const marginTop = firstPage
                    ? `calc(${_pageHeaderHeight}px + ${_pageHeight}px)`
                    : _pageHeight + "px";
                if (pageNumber) {
                    page.style.marginTop = `var(--rm-page-content-${pageNumber}, ${marginTop})`;
                } else {
                    page.style.marginTop = firstPage
                        ? `var(--rm-page-content-first, ${marginTop})`
                        : `var(--rm-page-content-general, ${marginTop})`;
                }
                const pageBreak = document.createElement("div");
                pageBreak.classList.add("breaker");
                pageBreak.style.width = `calc(100% + var(--rm-margin-left) + var(--rm-margin-right))`;
                pageBreak.style.marginLeft = `calc(-1 * var(--rm-margin-left))`;
                pageBreak.style.marginRight = `calc(-1 * var(--rm-margin-right))`;
                pageBreak.style.position = "relative";
                pageBreak.style.float = "left";
                pageBreak.style.clear = "both";
                pageBreak.style.left = `0px`;
                pageBreak.style.right = `0px`;
                pageBreak.style.zIndex = "2";
                const pageSpace = document.createElement("div");
                pageSpace.classList.add("rm-pagination-gap");
                pageSpace.style.height = _pageGap + "px";
                pageSpace.style.borderLeft = "1px solid";
                pageSpace.style.borderRight = "1px solid";
                pageSpace.style.position = "relative";
                pageSpace.style.setProperty("width", "calc(100% + 2px)", "important");
                pageSpace.style.left = "-1px";
                pageSpace.style.backgroundColor = _pageBreakBackground;
                pageSpace.style.borderLeftColor = _pageBreakBackground;
                pageSpace.style.borderRightColor = _pageBreakBackground;
                pageBreak.appendChild(pageFooter);
                pageBreak.appendChild(pageSpace);
                pageBreak.appendChild(pageHeader);
                pageContainer.appendChild(page);
                pageContainer.appendChild(pageBreak);
                return pageContainer;
            };

            const _headerHeight = headerHeightMap.get(0) || 0;
            const _footerHeight = footerHeightMap.get(0) || 0;
            const fragment = document.createDocumentFragment();
            const pageCount = calculatePageCount(view, pageOptions);

            for (let i = 0; i < pageCount; i++) {
                const pageNumber = i + 1;
                const headerPageNumber = i + 2;
                if (
                    headerPageNumber in pageOptions.customHeader ||
                    pageNumber in pageOptions.customFooter ||
                    pageNumber in pageOptions.customHeader
                ) {
                    let _headerOptions: RequiredHeaderOptions = commonHeaderOptions;
                    let _footerOptions: RequiredFooterOptions = commonFooterOptions;
                    let _pageHeaderHeight = _headerHeight;
                    let _pageFooterHeight = _footerHeight;
                    if (headerPageNumber in pageOptions.customHeader) {
                        const customHeader = pageOptions.customHeader[headerPageNumber];
                        _headerOptions = {
                            headerLeft: customHeader?.headerLeft ?? commonHeaderOptions.headerLeft,
                            headerRight: customHeader?.headerRight ?? commonHeaderOptions.headerRight,
                        };
                        _pageHeaderHeight = headerHeightMap.get(headerPageNumber) || 0;
                    }
                    if (pageNumber in pageOptions.customFooter) {
                        const customFooter = pageOptions.customFooter[pageNumber];
                        _footerOptions = {
                            footerLeft: customFooter?.footerLeft ?? commonFooterOptions.footerLeft,
                            footerRight: customFooter?.footerRight ?? commonFooterOptions.footerRight,
                        };
                        _pageFooterHeight = footerHeightMap.get(pageNumber) || 0;
                    }
                    const _pageHeader = getHeader(
                        _headerOptions.headerRight || "",
                        _headerOptions.headerLeft || "",
                        headerClickEvent(headerPageNumber, pageOptions.onHeaderClick),
                        headerPageNumber,
                    );
                    const _pageFooter = getFooter(
                        _footerOptions.footerRight || "",
                        _footerOptions.footerLeft || "",
                        footerClickEvent(pageNumber, pageOptions.onFooterClick),
                        pageNumber,
                    );
                    const pageBreak = pageBreakDefinition(
                        i === 0,
                        _pageHeader,
                        _pageFooter,
                        _pageHeaderHeight,
                        _pageFooterHeight,
                        pageNumber,
                    );
                    fragment.appendChild(pageBreak);
                } else {
                    const __pageHeader = getHeader(
                        commonHeaderOptions.headerRight || "",
                        commonHeaderOptions.headerLeft || "",
                        headerClickEvent(headerPageNumber, pageOptions.onHeaderClick),
                    );
                    const __pageFooter = getFooter(
                        commonFooterOptions.footerRight || "",
                        commonFooterOptions.footerLeft || "",
                        footerClickEvent(pageNumber, pageOptions.onFooterClick),
                    );
                    fragment.appendChild(
                        pageBreakDefinition(i === 0, __pageHeader, __pageFooter, _headerHeight, _footerHeight),
                    );
                }
            }
            el.appendChild(fragment);
            el.id = "pages";
            el.classList.add("rm-pages-wrapper");
            return el;
        },
        { side: -1 },
    );

    const firstHeaderWidget = Decoration.widget(
        0,
        () => {
            const pageNumber = 1;
            let _headerOptions: RequiredHeaderOptions = commonHeaderOptions;
            if (pageNumber in pageOptions.customHeader) {
                const customHeader = pageOptions.customHeader[pageNumber];
                _headerOptions = {
                    headerLeft: customHeader?.headerLeft ?? commonHeaderOptions.headerLeft,
                    headerRight: customHeader?.headerRight ?? commonHeaderOptions.headerRight,
                };
            }
            const el = getHeader(
                _headerOptions.headerRight || "",
                _headerOptions.headerLeft || "",
                headerClickEvent(pageNumber, pageOptions.onHeaderClick),
            );
            el.classList.add("rm-first-page-header");
            return el;
        },
        { side: -1 },
    );

    return [pageWidget, firstHeaderWidget];
}

// ============================================================================
// Main Extension
// ============================================================================

export const PaginationPlus = Extension.create<PaginationPlusOptions, PaginationPlusStorage>({
    name: "PaginationPlus",

    addOptions() {
        return defaultOptions;
    },

    addStorage() {
        return {
            ...this.options,
            headerHeight: new Map(),
            footerHeight: new Map(),
        };
    },

    onCreate() {
        const targetNode = this.editor.view.dom as HTMLElement;
        targetNode.classList.add("rm-with-pagination");
        targetNode.style.border = `1px solid var(--rm-page-gap-border-color)`;
        targetNode.style.paddingLeft = `var(--rm-margin-left)`;
        targetNode.style.paddingRight = `var(--rm-margin-right)`;
        targetNode.style.width = `var(--rm-page-width)`;
        updateCssVariables(targetNode, this.options);

        const style = document.createElement("style");
        style.dataset.rmPaginationStyle = "";
        style.textContent = `
      .rm-pagination-gap{
        border-top: 1px solid;
        border-bottom: 1px solid;
        border-color: var(--rm-page-gap-border-color);
      }
      .rm-with-pagination,
      .rm-with-pagination .rm-first-page-header {
        counter-reset: page-number page-number-plus 1;
      }
      .rm-with-pagination .image-plus-wrapper,
      .rm-with-pagination .table-plus td,
      .rm-with-pagination .table-plus th {
        max-height: var(--rm-max-content-child-height);
        overflow-y: auto;
      }
      .rm-with-pagination .image-plus-wrapper {
        overflow-y: visible;
      }
      .rm-with-pagination .rm-page-break {
        counter-increment: page-number page-number-plus;
      }

      .rm-with-pagination .rm-page-break:last-child .rm-pagination-gap {
        display: none;
      }
      .rm-with-pagination .rm-page-break:last-child .rm-page-header {
        display: none;
      }

      .rm-with-pagination table tr td,
      .rm-with-pagination table tr th {
        word-break: break-all;
      }
      .rm-with-pagination table > tr {
        display: grid;
        min-width: 100%;
      }
      .rm-with-pagination table {
        border-collapse: collapse;
        width: 100%;
        display: contents;
      }
      .rm-with-pagination table tbody{
        display: table;
        max-height: 300px;
        overflow-y: auto;
      }
      .rm-with-pagination table tbody > tr{
        display: table-row !important;
      }
      .rm-with-pagination .rm-br-decoration {
        display: table;
        width: 100%;
      }
      .rm-with-pagination .table-row-group {
        max-height: var(--rm-max-content-child-height);
        overflow-y: auto;
        width: 100%;
      }
      .rm-with-pagination .rm-page-footer-left,
      .rm-with-pagination .rm-page-footer-right,
      .rm-with-pagination .rm-page-header-left,
      .rm-with-pagination .rm-page-header-right {
        display: inline-block;
      }

      .rm-with-pagination .rm-page-header-left,
      .rm-with-pagination .rm-page-footer-left{
        float: left;
        margin-left: var(--rm-margin-left);
      }
      .rm-with-pagination .rm-page-header-right,
      .rm-with-pagination .rm-page-footer-right{
        float: right;
        margin-right: var(--rm-margin-right);
      }
      .rm-with-pagination .rm-first-page-header .rm-page-header-right{
        margin-right: 0px !important;
      }
      .rm-with-pagination .rm-first-page-header .rm-page-header-left{
        margin-left: 0px !important;
      }
      .rm-with-pagination .rm-page-number::before {
        content: counter(page-number);
      }
      .rm-with-pagination .rm-page-number-plus::before {
        content: counter(page-number-plus);
      }
      .rm-with-pagination .rm-page-header,
      .rm-with-pagination .rm-page-footer{
        width: 100%;
      }
      .rm-with-pagination .rm-page-header{
        padding-bottom: var(--rm-content-margin-top) !important;
        padding-top: var(--rm-margin-top) !important;
        display: inline-flex;
        justify-content: space-between;
        max-height: calc(calc(var(--rm-page-height) * 0.45) - var(--rm-margin-top) - var(--rm-content-margin-top));
        overflow-y: hidden;
      }
      .rm-with-pagination .rm-page-footer{
        padding-top: var(--rm-content-margin-bottom) !important;
        padding-bottom: var(--rm-margin-bottom) !important;
        display: inline-flex;
        justify-content: space-between;
        max-height: calc(calc(var(--rm-page-height) * 0.45) - var(--rm-content-margin-bottom) - var(--rm-margin-bottom));
        overflow-y: hidden;
      }
    `;
        document.head.appendChild(style);
        refreshPage(targetNode);
    },

    addProseMirrorPlugins() {
        const editor = this.editor;
        const extension = this;

        const buildNewDecoration = (opts: PaginationPlusOptions, newState: any) => {
            const view = safeGetView(editor);
            if (view) updateCssVariables(view.dom as HTMLElement, opts);
            const headerHeight =
                "headerHeight" in extension.storage
                    ? extension.storage.headerHeight
                    : new Map<number, number>();
            const footerHeight =
                "footerHeight" in extension.storage
                    ? extension.storage.footerHeight
                    : new Map<number, number>();
            const widgetList = createDecoration(opts, headerHeight, footerHeight);
            extension.storage = { ...opts, headerHeight, footerHeight };
            return {
                decorations: DecorationSet.create(newState.doc, [...widgetList]),
                footerHeight,
            };
        };

        return [
            new Plugin({
                key: paginationKey,
                state: {
                    init: (_, state) => {
                        const widgetList = createDecoration(extension.options, new Map(), new Map());
                        extension.storage = {
                            ...extension.options,
                            headerHeight: new Map(),
                            footerHeight: new Map(),
                        };
                        return {
                            decorations: DecorationSet.create(state.doc, widgetList),
                        };
                    },
                    apply: (tr, oldDeco, _oldState, newState) => {
                        // PERFORMANCE: apply() must NEVER read from the DOM.
                        // All DOM measurement (offsetTop, offsetHeight, etc.) happens
                        // exclusively in the debounced RAF inside view.update().
                        // apply() only rebuilds decorations when:
                        //   1. The RAF signals a page count change via page_count_meta
                        //   2. Plugin options changed (e.g. updatePageSize command)

                        const isPageCountMeta = tr.getMeta(page_count_meta_key) !== undefined;

                        if (isPageCountMeta) {
                            // RAF detected a page count change — rebuild decorations
                            const opts = editor.storage.PaginationPlus as PaginationPlusOptions;
                            return buildNewDecoration(opts, newState);
                        }

                        if (!tr.docChanged) {
                            // Check if options changed (e.g. updatePageSize commands)
                            const opts = editor.storage.PaginationPlus as PaginationPlusOptions;
                            if (!deepEqualIterative(opts, extension.storage)) {
                                return buildNewDecoration(opts, newState);
                            }
                        }

                        return oldDeco;
                    },
                },
                props: {
                    decorations(state) {
                        return (this.getState(state) as any)?.decorations;
                    },
                },
                view: () => {
                    // Track if we need a page count update to avoid double RAF
                    let needsPageCountUpdate = false;
                    let initialRun = true;
                    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

                    return {
                        update: (view, prevState) => {
                            // PERFORMANCE: Skip when doc hasn't changed
                            // (cursor moves, selection changes, focus events)
                            // Always run on the very first update to compute initial page breaks
                            if (!initialRun && view.state.doc.eq(prevState.doc)) {
                                return;
                            }

                            // Debounce: wait for a pause in typing before measuring the DOM.
                            // This avoids forced reflows on every keystroke.
                            // Use a short delay on initial run so page breaks appear quickly.
                            if (pendingViewUpdate !== null) {
                                cancelAnimationFrame(pendingViewUpdate);
                                pendingViewUpdate = null;
                            }
                            if (debounceTimer !== null) {
                                clearTimeout(debounceTimer);
                            }

                            const delay = initialRun ? 50 : 300;
                            initialRun = false;

                            // Invalidate height cache for next frame
                            invalidateHeightCache();

                            debounceTimer = setTimeout(() => {
                                debounceTimer = null;

                                pendingViewUpdate = requestAnimationFrame(() => {
                                    pendingViewUpdate = null;

                                    const opts = editor.storage.PaginationPlus as PaginationPlusOptions;
                                    const pageCount = calculatePageCount(view, opts);
                                    lastCalculatedPageCount = pageCount;
                                    const currentPageCount = getExistingPageCount(view);

                                    if (currentPageCount !== pageCount) {
                                        if (!needsPageCountUpdate) {
                                            needsPageCountUpdate = true;
                                            queueMicrotask(() => {
                                                needsPageCountUpdate = false;
                                                const tr = view.state.tr.setMeta(page_count_meta_key, {});
                                                view.dispatch(tr);
                                            });
                                        }
                                        return;
                                    }

                                    // All DOM reads batched here
                                    const headerHeight = getHeaderHeight(
                                        view.dom as HTMLElement,
                                        getCustomPages(opts.customHeader, {}),
                                        "content",
                                    );
                                    const footerHeight = getFooterHeight(
                                        view.dom as HTMLElement,
                                        getCustomPages({}, opts.customFooter),
                                        "content",
                                    );

                                    const footerHeightForCurrentPages = new Map<number, number>();
                                    for (let i = 0; i <= pageCount; i++) {
                                        if (footerHeight.has(i)) {
                                            footerHeightForCurrentPages.set(i, footerHeight.get(i) || 0);
                                        }
                                    }

                                    const headerHeightForCurrentPages = new Map<number, number>();
                                    for (let i = 0; i <= pageCount; i++) {
                                        if (headerHeight.has(i)) {
                                            headerHeightForCurrentPages.set(i, headerHeight.get(i) || 0);
                                        }
                                    }

                                    const pagesSetToCheck = new Set([
                                        1,
                                        ...footerHeightForCurrentPages.keys(),
                                        ...headerHeightForCurrentPages.keys(),
                                    ]);
                                    let missingPageNumber: number | undefined = undefined;
                                    for (let i = 1; i <= pageCount; i++) {
                                        if (!pagesSetToCheck.has(i)) {
                                            missingPageNumber = i;
                                            break;
                                        }
                                    }
                                    if (missingPageNumber) {
                                        pagesSetToCheck.add(missingPageNumber);
                                    }
                                    pagesSetToCheck.delete(0);

                                    const pageContentHeightVariable: Record<string, string> = {};
                                    let maxContentHeight: number | undefined = undefined;

                                    for (const page of pagesSetToCheck) {
                                        const hHeight = headerHeightForCurrentPages.has(page)
                                            ? headerHeightForCurrentPages.get(page) || 0
                                            : headerHeightForCurrentPages.get(0) || 0;
                                        const fHeight = footerHeightForCurrentPages.has(page)
                                            ? footerHeightForCurrentPages.get(page) || 0
                                            : footerHeightForCurrentPages.get(0) || 0;
                                        const { _pageHeaderHeight, _pageHeight } = getHeight(opts, hHeight, fHeight);
                                        const contentHeight =
                                            page === 1 ? _pageHeight + _pageHeaderHeight : _pageHeight;

                                        if (page === 1) {
                                            pageContentHeightVariable[`rm-page-content-first`] =
                                                `${contentHeight}px`;
                                        }
                                        if (page === missingPageNumber) {
                                            pageContentHeightVariable[`rm-page-content-general`] =
                                                `${contentHeight}px`;
                                        } else {
                                            pageContentHeightVariable[`rm-page-content-${page}`] =
                                                `${contentHeight}px`;
                                        }
                                        if (maxContentHeight === undefined || contentHeight < maxContentHeight) {
                                            maxContentHeight = contentHeight;
                                        }
                                    }

                                    // Batch all DOM writes together (after all reads)
                                    if (maxContentHeight) {
                                        (view.dom as HTMLElement).style.setProperty(
                                            `--rm-max-content-child-height`,
                                            `${maxContentHeight - 10}px`,
                                        );
                                    }

                                    Object.entries(pageContentHeightVariable).forEach(([key, value]) => {
                                        (view.dom as HTMLElement).style.setProperty(`--${key}`, value);
                                    });

                                    refreshPage(view.dom as HTMLElement);
                                });
                            }, delay);
                        },
                        destroy: () => {
                            if (debounceTimer !== null) {
                                clearTimeout(debounceTimer);
                                debounceTimer = null;
                            }
                            if (pendingViewUpdate !== null) {
                                cancelAnimationFrame(pendingViewUpdate);
                                pendingViewUpdate = null;
                            }
                            if (heightCacheFrame !== null) {
                                cancelAnimationFrame(heightCacheFrame);
                                heightCacheFrame = null;
                            }
                        },
                    };
                },
            }),
            new Plugin({
                key: brDecorationKey,
                state: {
                    init(_, state) {
                        return buildDecorations(state.doc);
                    },
                    apply(tr, old) {
                        if (!tr.docChanged) return old;
                        // Only rebuild when structural changes might add/remove hardBreaks
                        // (e.g. ReplaceAroundStep wraps/unwraps nodes)
                        if (tr.steps.some((step) => step instanceof ReplaceAroundStep)) {
                            return buildDecorations(tr.doc);
                        }
                        // For simple text edits, just remap decoration positions (O(log n))
                        return old.map(tr.mapping, tr.doc);
                    },
                },
                props: {
                    decorations(state) {
                        return brDecorationKey.getState(state) ?? DecorationSet.empty;
                    },
                },
            }),
        ];
    },

    addCommands() {
        return {
            updatePageBreakBackground:
                (color: string) =>
                () => {
                    this.storage.pageBreakBackground = color;
                    return true;
                },
            updatePageSize:
                (size: { pageHeight: number; pageWidth: number; marginTop: number; marginBottom: number; marginLeft: number; marginRight: number }) =>
                () => {
                    this.storage.pageHeight = size.pageHeight;
                    this.storage.pageWidth = size.pageWidth;
                    this.storage.marginTop = size.marginTop;
                    this.storage.marginBottom = size.marginBottom;
                    this.storage.marginLeft = size.marginLeft;
                    this.storage.marginRight = size.marginRight;
                    return true;
                },
            updatePageWidth:
                (width: number) =>
                () => {
                    this.storage.pageWidth = width;
                    return true;
                },
            updatePageHeight:
                (height: number) =>
                () => {
                    this.storage.pageHeight = height;
                    return true;
                },
            updatePageGap:
                (gap: number) =>
                () => {
                    this.storage.pageGap = gap;
                    return true;
                },
            updateMargins:
                (margins: { top: number; bottom: number; left: number; right: number }) =>
                () => {
                    this.storage.marginTop = margins.top;
                    this.storage.marginBottom = margins.bottom;
                    this.storage.marginLeft = margins.left;
                    this.storage.marginRight = margins.right;
                    return true;
                },
            updateContentMargins:
                (margins: { top: number; bottom: number }) =>
                () => {
                    this.storage.contentMarginTop = margins.top;
                    this.storage.contentMarginBottom = margins.bottom;
                    return true;
                },
            updateHeaderContent:
                (left: string, right: string, pageNumber?: number) =>
                () => {
                    if (pageNumber) {
                        this.storage.customHeader = {
                            ...this.options.customHeader,
                            [pageNumber]: { headerLeft: left, headerRight: right },
                        };
                    } else {
                        this.storage.headerLeft = left;
                        this.storage.headerRight = right;
                    }
                    return true;
                },
            updateFooterContent:
                (left: string, right: string, pageNumber?: number) =>
                () => {
                    if (pageNumber) {
                        this.storage.customFooter = {
                            ...this.options.customFooter,
                            [pageNumber]: { footerLeft: left, footerRight: right },
                        };
                    } else {
                        this.storage.footerLeft = left;
                        this.storage.footerRight = right;
                    }
                    return true;
                },
        };
    },
});
