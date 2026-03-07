import { DOMSerializer } from "@node_modules/prosemirror-model/dist";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export interface PaginationPlusOptions {
    pageHeight: number; // full physical page height in px
    pageWidth: number; // full physical page width in px
    pageGap: number; // visual gap between pages in px
    pageGapBorderSize: number;
    pageGapBorderColor: string;
    pageBreakBackground: string;
    marginTop: number; // space reserved at top for header + padding
    marginBottom: number; // space reserved at bottom for footer + padding
    marginLeft: number;
    marginRight: number;
    headerLeft: string;
    headerRight: string;
    footerLeft: string;
    footerRight: string;
    customHeader: Record<PageNumber, HeaderOptions>;
    customFooter: Record<PageNumber, FooterOptions>;
}

export interface PageBreakInfo {
    pos: number; // document position where the break decoration is inserted (before the first node on the new page)
    pagenum: number; // page number AFTER this break
    freespace: number; // empty space remaining at the bottom of the ending page's content area
}

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        PaginationPlus: {
            updatePageSize: (size: Partial<PageSize>) => ReturnType;
            updatePageHeight: (height: number) => ReturnType;
            updatePageWidth: (width: number) => ReturnType;
            updatePageGap: (gap: number) => ReturnType;
            updateMargins: (margins: { top: number; bottom: number; left: number; right: number }) => ReturnType;
            updateHeaderContent: (left: string, right: string, pageNumber?: PageNumber) => ReturnType;
            updateFooterContent: (left: string, right: string, pageNumber?: PageNumber) => ReturnType;
            updatePageBreakBackground: (color: string) => ReturnType;
        };
    }
}

// ---------------------------------------------------------------------------
// Default options
// ---------------------------------------------------------------------------

const defaultOptions: PaginationPlusOptions = {
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
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function syncVars(dom: HTMLElement, o: PaginationPlusOptions) {
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
// Page break computation
// ---------------------------------------------------------------------------

function computePageBreaks(doc: any, options: PaginationPlusOptions): PageBreakInfo[] {
    const contentHeight = options.pageHeight - options.marginTop - options.marginBottom;
    const breaks: PageBreakInfo[] = [];
    let pagePos = 0;
    let pagenum = 1;

    doc.forEach((node: any, offset: number) => {
        const height = node.attrs?.height as number | null;
        if (height == null) return;

        pagePos += height;

        if (pagePos > contentHeight) {
            const freespace = contentHeight - (pagePos - height);
            breaks.push({
                pos: offset,
                pagenum: pagenum + 1,
                freespace: Math.max(0, freespace),
            });
            pagenum++;
            pagePos = height;
        }
    });

    return breaks;
}

// ---------------------------------------------------------------------------
// Decoration builders
// ---------------------------------------------------------------------------

function renderHeader(pagenum: number, options: PaginationPlusOptions): string {
    const custom = options.customHeader[pagenum];
    const left = custom?.headerLeft ?? options.headerLeft;
    const right = (custom?.headerRight ?? options.headerRight).replace("{page}", `${pagenum}`);
    if (!left && !right) return "";
    return (
        `<span class="pagination-header-left">${left}</span>` + `<span class="pagination-header-right">${right}</span>`
    );
}

function renderFooter(pagenum: number, options: PaginationPlusOptions): string {
    const custom = options.customFooter[pagenum];
    const left = custom?.footerLeft ?? options.footerLeft;
    const right = (custom?.footerRight ?? options.footerRight).replace("{page}", `${pagenum}`);
    if (!left && !right) return "";
    return (
        `<span class="pagination-footer-left">${left}</span>` + `<span class="pagination-footer-right">${right}</span>`
    );
}

function createFirstPageWidget(options: PaginationPlusOptions): HTMLElement {
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
    headerArea.innerHTML = renderHeader(1, options);

    overlay.appendChild(headerArea);
    container.appendChild(spacer);
    container.appendChild(overlay);
    return container;
}

function createPageBreakWidget(breakInfo: PageBreakInfo, options: PaginationPlusOptions): HTMLElement {
    const container = document.createElement("div");
    container.className = "pagination-page-break";
    container.contentEditable = "false";

    // Spacer: pushes text in the document flow past the entire page boundary.
    // Includes freespace because the spacer is the only thing that moves text.
    const spacerHeight = breakInfo.freespace + options.marginBottom + options.pageGap + options.marginTop;
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

    // Footer area of the ending page (fixed size = marginBottom)
    const footerArea = document.createElement("div");
    footerArea.className = "pagination-footer-area";
    footerArea.style.height = `${options.marginBottom}px`;
    footerArea.innerHTML = renderFooter(breakInfo.pagenum - 1, options);

    // Visual gap between pages (fixed size = pageGap)
    const divider = document.createElement("div");
    divider.className = "pagination-divider";
    divider.style.height = `${options.pageGap}px`;
    divider.style.backgroundColor = "var(--main-bg)";

    // Header area of the new page (fixed size = marginTop)
    const headerArea = document.createElement("div");
    headerArea.className = "pagination-header-area";
    headerArea.style.height = `${options.marginTop}px`;
    headerArea.innerHTML = renderHeader(breakInfo.pagenum, options);

    console.log("options.marginTop: ", options.marginTop);

    overlay.appendChild(footerArea);
    overlay.appendChild(divider);
    overlay.appendChild(headerArea);
    container.appendChild(spacer);
    container.appendChild(overlay);
    return container;
}

function createLastPageWidget(pagenum: number, options: PaginationPlusOptions): HTMLElement {
    const container = document.createElement("div");
    container.className = "pagination-last-page";
    container.contentEditable = "false";

    const spacer = document.createElement("div");
    spacer.className = "pagination-spacer";
    spacer.style.height = `${options.marginBottom}px`;

    const overlay = document.createElement("div");
    overlay.className = "pagination-overlay";
    overlay.style.top = "0";
    overlay.style.height = `${options.marginBottom}px`;

    const footerArea = document.createElement("div");
    footerArea.className = "pagination-footer-area";
    footerArea.style.height = `${options.marginBottom}px`;
    footerArea.innerHTML = renderFooter(pagenum, options);

    overlay.appendChild(footerArea);
    container.appendChild(spacer);
    container.appendChild(overlay);
    return container;
}

function buildDecorations(doc: any, breaks: PageBreakInfo[], options: PaginationPlusOptions): DecorationSet {
    const decorations: Decoration[] = [];

    // First page top margin / header
    decorations.push(
        Decoration.widget(0, createFirstPageWidget(options), {
            side: -1,
            key: "page-1-header",
        }),
    );

    // Page breaks
    for (const b of breaks) {
        decorations.push(
            Decoration.widget(b.pos, createPageBreakWidget(b, options), {
                side: -1,
                key: `page-${b.pagenum}`,
            }),
        );
    }

    // Last page bottom margin / footer
    const lastPagenum = breaks.length > 0 ? breaks[breaks.length - 1].pagenum : 1;
    decorations.push(
        Decoration.widget(doc.content.size, createLastPageWidget(lastPagenum, options), {
            side: 1,
            key: `page-${lastPagenum}-footer`,
        }),
    );

    return DecorationSet.create(doc, decorations);
}

// ---------------------------------------------------------------------------
// Height measurement
// ---------------------------------------------------------------------------

const getHTMLHeight = (
    domNode: HTMLElement,
    editorDom: HTMLElement,
    nodeType: string,
    options: PaginationPlusOptions,
): number => {
    let testDiv = setupTestDiv(editorDom, options);
    testDiv.innerHTML = domNode.outerHTML;
    const rect = testDiv.getBoundingClientRect();
    return Math.round(rect.height);
};

const setupTestDiv = (editorDom: HTMLElement, options: PaginationPlusOptions): HTMLElement => {
    let testDiv = document.getElementById("pagination-test-div");
    if (!testDiv) {
        testDiv = document.createElement("div");
        testDiv.id = "pagination-test-div";
        testDiv.className = "ProseMirror pagination";
        testDiv.style.position = "absolute";
        testDiv.style.pointerEvents = "none";
        testDiv.style.whiteSpace = "break-spaces";
        testDiv.style.visibility = "hidden";

        // Prevent margin collapsing which would introduce inconsistencies in height
        testDiv.style.borderTop = "1px solid transparent";
        testDiv.style.borderBottom = "1px solid transparent";
        // The .pagination class sets min-height: var(--page-height) for the editor,
        // but the test div must shrink to fit each node's content.
        testDiv.style.minHeight = "0";

        document.body.appendChild(testDiv);
    }

    // Set CSS variables so the .pagination !important rules (width, padding) resolve correctly.
    // testDiv lives in <body>, not inside the editor, so it doesn't inherit the editor's CSS vars.
    syncVars(testDiv, options);

    return testDiv;
};

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const paginationKey = new PluginKey("pagination");

interface PaginationState {
    decset: DecorationSet;
    heightUpdates: { pos: number; height: number }[];
    breaks: PageBreakInfo[];
}

const createPaginationPlugin = (extension: any) =>
    new Plugin({
        key: paginationKey,
        state: {
            init: (): PaginationState => ({
                decset: DecorationSet.empty,
                heightUpdates: [],
                breaks: [],
            }),
            apply(tr, value: PaginationState, oldState, newState): PaginationState {
                const options = extension.options as PaginationPlusOptions;
                const heightUpdate = tr.getMeta("heightUpdate");
                const formatUpdate = tr.getMeta("pageFormatUpdate");
                const forceUpdate = tr.getMeta("forcePaginationUpdate");

                // Nothing pagination-related changed
                if (!tr.docChanged && !forceUpdate && !formatUpdate) return value;

                // Heights were just committed by appendTransaction → compute page breaks
                if (heightUpdate) {
                    const breaks = computePageBreaks(newState.doc, options);
                    const decset = buildDecorations(newState.doc, breaks, options);
                    return { decset, heightUpdates: [], breaks };
                }

                // Detect which nodes changed
                const changedPositions = new Set<number>();
                if (tr.docChanged) {
                    tr.steps.forEach((step) => {
                        const map = step.getMap();
                        map.forEach((_oS: number, _oE: number, newStart: number, newEnd: number) => {
                            newState.doc.nodesBetween(newStart, newEnd, (_node, pos) => {
                                changedPositions.add(pos);
                            });
                        });
                    });
                }

                // Measure heights for dirty nodes
                const editorDOM = extension.editor.view.dom as HTMLElement;
                const serializer = DOMSerializer.fromSchema(newState.schema);
                const heightUpdates: { pos: number; height: number }[] = [];

                newState.doc.descendants((node, pos) => {
                    if (!("height" in node.attrs)) return;

                    const cached = node.attrs.height as number | null;
                    const isDirty = forceUpdate || formatUpdate || cached === null || changedPositions.has(pos);

                    if (!isDirty) return;

                    const element = serializer.serializeNode(node) as HTMLElement;
                    const height = getHTMLHeight(element, editorDOM, node.type.name, options);

                    if (height !== cached) heightUpdates.push({ pos, height });
                });

                // Heights need committing first → defer break computation to the next apply
                if (heightUpdates.length > 0) {
                    return {
                        decset: value.decset.map(tr.mapping, tr.doc),
                        heightUpdates,
                        breaks: value.breaks,
                    };
                }

                // No height changes but doc or format changed → recompute breaks with cached heights
                const breaks = computePageBreaks(newState.doc, options);
                const decset = buildDecorations(newState.doc, breaks, options);
                return { decset, heightUpdates: [], breaks };
            },
        },
        appendTransaction(transactions, oldState, newState) {
            const state = paginationKey.getState(newState) as PaginationState | undefined;
            if (!state?.heightUpdates.length) return;

            const tr = newState.tr;
            tr.setMeta("heightUpdate", true);
            tr.setMeta("addToHistory", false);

            state.heightUpdates.forEach(({ pos, height }) => {
                const node = newState.doc.nodeAt(pos);
                if (node && node.attrs.height !== height) {
                    tr.setNodeMarkup(pos, undefined, { ...node.attrs, height });
                }
            });

            return tr.steps.length ? tr : null;
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

export const ScriptioPagination = Extension.create<PaginationPlusOptions>({
    name: "PaginationPlus",

    addOptions() {
        return defaultOptions;
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
                }

                .pagination-overlay {
                    position: absolute;
                    left: 0;
                    right: 0;
                    z-index: 10;
                    display: flex;
                    flex-direction: column;
                    justify-content: flex-end;
                    background: var(--page-break-background, #fff);
                }

                .pagination-footer-area,
                .pagination-header-area {
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 var(--page-margin-right) 0 var(--page-margin-left);
                    box-sizing: border-box;
                    background: var(--page-break-background, #fff);
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
            `;
            document.head.appendChild(style);
        }

        setupTestDiv(editorDOM, this.options);

        // Trigger initial pagination after editor is ready
        setTimeout(() => {
            const tr = this.editor.state.tr;
            tr.setMeta("forcePaginationUpdate", true);
            tr.setMeta("addToHistory", false);
            this.editor.view.dispatch(tr);
        }, 0);
    },

    addProseMirrorPlugins() {
        return [createPaginationPlugin(this)];
    },

    addCommands() {
        const trigger = (tr: any, meta: string) => {
            tr.setMeta(meta, true);
            this.editor.view.dispatch(tr);
        };

        return {
            updatePageSize:
                (size) =>
                ({ tr }) => {
                    Object.assign(this.options, size);
                    syncVars(this.editor.view.dom, this.options);
                    trigger(tr, "pageFormatUpdate");
                    return true;
                },
            updatePageHeight:
                (h) =>
                ({ tr }) => {
                    this.options.pageHeight = h;
                    syncVars(this.editor.view.dom, this.options);
                    trigger(tr, "pageFormatUpdate");
                    return true;
                },
            updatePageWidth:
                (w) =>
                ({ tr }) => {
                    this.options.pageWidth = w;
                    syncVars(this.editor.view.dom, this.options);
                    trigger(tr, "pageFormatUpdate");
                    return true;
                },
            updatePageGap:
                (g) =>
                ({ tr }) => {
                    this.options.pageGap = g;
                    trigger(tr, "forcePaginationUpdate");
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
                    trigger(tr, "pageFormatUpdate");
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
                    trigger(tr, "forcePaginationUpdate");
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
                    trigger(tr, "forcePaginationUpdate");
                    return true;
                },
            updatePageBreakBackground:
                (c) =>
                ({ tr }) => {
                    this.options.pageBreakBackground = c;
                    trigger(tr, "forcePaginationUpdate");
                    return true;
                },
        };
    },
});
