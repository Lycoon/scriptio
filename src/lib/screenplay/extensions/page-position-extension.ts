import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";

export interface PagePositionOptions {
    pageHeight: number;
}

export interface PageNodeInfo {
    pos: number;
    nodeType: string;
    dom: HTMLElement;
    startsOnPage: number;
    endsOnPage: number;
    isSpanning: boolean;
}

export interface PageInfo {
    pageNumber: number;
    firstNode: PageNodeInfo | null;
    lastNode: PageNodeInfo | null;
    nodes: PageNodeInfo[];
    spanningNodes: PageNodeInfo[];
}

export type PageMap = PageInfo[];

const pagePositionPluginKey = new PluginKey("pagePosition");

const PAGE_FIRST_CLASS = "page-first";
const ORPHAN_PUSHDOWN_ATTR = "data-orphan-pushdown";
// Threshold: if a character/scene-heading is within this many pixels of page boundary, push it
const ORPHAN_THRESHOLD_PX = 50;

// Debug flag - set to false in production to avoid console overhead
const DEBUG = false;
function debugLog(...args: any[]) {
    if (DEBUG) console.log("[PagePosition]", ...args);
}

/**
 * Collects breaker elements for overlay insertion and measures the actual gap height.
 * Only queries the DOM once per detection cycle.
 */
function collectBreakers(editorDom: HTMLElement): { breakers: HTMLElement[]; breakerHeight: number } {
    const breakerNodes = editorDom.querySelectorAll("[data-rm-pagination] .breaker");
    const breakers = Array.from(breakerNodes) as HTMLElement[];

    // Measure actual breaker height from the first breaker using offsetHeight (no reflow)
    let breakerHeight = 0;
    if (breakers.length > 0) {
        breakerHeight = breakers[0].offsetHeight;

        // Only log in debug mode - avoid getBoundingClientRect() in production
        if (DEBUG) {
            const breakerInfo = breakers.map((b, i) => ({
                index: i,
                offsetTop: (b.parentElement as HTMLElement)?.offsetTop || 0,
                height: b.offsetHeight,
            }));
            debugLog("Breaker info:", { breakerHeight, breakers: breakerInfo });
        }
    }

    return { breakers, breakerHeight };
}

/**
 * Determines which page a node belongs to based on its absolute offset
 * within the editor. Uses simple division instead of DOM measurements
 * for O(1) performance.
 *
 * @param offsetTop - Element's offsetTop within the editor
 * @param pageStride - Total height per page including gap (pageHeight + pageGap)
 */
function getPageIndex(offsetTop: number, pageStride: number): number {
    return Math.floor(offsetTop / pageStride);
}

/**
 * Walks backwards through DOM siblings from a spanning dialogue/parenthetical
 * to find the nearest character element. Returns the character name (uppercase, trimmed).
 */
function findCharacterName(dialogueEl: HTMLElement): string | null {
    let sibling = dialogueEl.previousElementSibling as HTMLElement | null;

    while (sibling) {
        // Skip pagination widget decorations (they're inserted as siblings)
        if (sibling.hasAttribute("data-rm-pagination")) {
            sibling = sibling.previousElementSibling as HTMLElement | null;
            continue;
        }

        const classes = sibling.className || "";

        // Found a character element - return its text
        if (classes.includes("character")) {
            return (sibling.textContent || "").trim().toUpperCase();
        }

        // Skip over dialogue and parenthetical siblings (same dialogue block)
        if (classes.includes("dialogue") || classes.includes("parenthetical")) {
            sibling = sibling.previousElementSibling as HTMLElement | null;
            continue;
        }

        // Hit a different element type (scene, action, etc.) - no character found
        break;
    }

    return null;
}

/**
 * Creates (MORE) and (CONT'D) overlays for dialogue/parenthetical nodes
 * that span across page breaks. These overlays are positioned inside
 * breaker elements using absolute positioning.
 */
function applyMoreContdOverlays(editorDom: HTMLElement, pageMap: PageMap, breakers: HTMLElement[]) {
    // Remove old overlays
    editorDom.querySelectorAll("[data-page-overlay]").forEach((el) => el.remove());

    debugLog("applyMoreContdOverlays called", { pageMapLength: pageMap.length, breakersLength: breakers.length });

    let overlaysCreated = 0;

    // Process each page's spanning nodes
    for (let pageIdx = 0; pageIdx < pageMap.length; pageIdx++) {
        const page = pageMap[pageIdx];

        for (const info of page.spanningNodes) {
            const classes = info.nodeType || "";

            // Only process dialogue and parenthetical nodes
            if (!classes.includes("dialogue") && !classes.includes("parenthetical")) {
                debugLog(`Skipping non-dialogue spanning node on page ${pageIdx}:`, classes);
                continue;
            }

            // This node spans from a previous page into this one
            // The breaker index is (pageIdx - 1) since breaker[i] sits between page i and page i+1
            const breakerIdx = pageIdx - 1;
            if (breakerIdx < 0 || breakerIdx >= breakers.length) {
                debugLog(`Invalid breaker index ${breakerIdx} for page ${pageIdx}, breakers.length=${breakers.length}`);
                continue;
            }

            const breaker = breakers[breakerIdx];
            const characterName = findCharacterName(info.dom);

            if (!characterName) {
                debugLog(`No character name found for spanning dialogue on page ${pageIdx}`, info.dom.textContent?.slice(0, 50));
                continue;
            }

            debugLog(`Creating overlays for "${characterName}" at breaker ${breakerIdx} (page ${pageIdx})`);

            // Create (MORE) overlay - sits at bottom of previous page
            const moreOverlay = document.createElement("div");
            moreOverlay.className = "page-more-overlay";
            moreOverlay.setAttribute("data-page-overlay", "more");
            moreOverlay.textContent = "(MORE)";
            breaker.appendChild(moreOverlay);

            // Create (CONT'D) overlay - sits at top of next page
            const contdOverlay = document.createElement("div");
            contdOverlay.className = "page-contd-overlay";
            contdOverlay.setAttribute("data-page-overlay", "contd");
            contdOverlay.textContent = `${characterName} (CONT'D)`;
            breaker.appendChild(contdOverlay);

            overlaysCreated++;
        }
    }

    debugLog(`Total overlays created: ${overlaysCreated}`);
}

/**
 * Detects page positions using absolute positioning (offsetTop/offsetHeight)
 * instead of getBoundingClientRect() to avoid layout thrashing.
 * Groups content nodes by page and tracks spanning nodes.
 *
 * @param pageHeight - Visible content area height (without gap)
 */
function detectPagePositions(view: EditorView, pageHeight: number): { pageMap: PageMap; breakers: HTMLElement[]; pageStride: number } {
    const editorDom = view.dom as HTMLElement;
    const { breakers, breakerHeight } = collectBreakers(editorDom);

    // Calculate actual page stride from measured breaker height
    const pageStride = pageHeight + breakerHeight;

    debugLog("detectPagePositions called", { pageHeight, breakerHeight, pageStride, breakersCount: breakers.length });

    const paragraphs = editorDom.querySelectorAll(":scope > p");
    if (paragraphs.length === 0) return { pageMap: [], breakers, pageStride };

    const totalPages = breakers.length + 1;
    const pages: PageInfo[] = Array.from({ length: totalPages }, (_, i) => ({
        pageNumber: i + 1,
        firstNode: null,
        lastNode: null,
        nodes: [],
        spanningNodes: [],
    }));

    debugLog("Total pages based on breakers:", totalPages);

    const spanningDialogues: { nodeType: string; offsetTop: number; offsetBottom: number; startsOnPage: number; endsOnPage: number }[] = [];

    for (const p of paragraphs) {
        const el = p as HTMLElement;
        // Use offsetTop/offsetHeight instead of getBoundingClientRect() - no reflow!
        const offsetTop = el.offsetTop;
        const offsetBottom = offsetTop + el.offsetHeight;
        const startsOnPage = getPageIndex(offsetTop, pageStride);
        const endsOnPage = getPageIndex(offsetBottom, pageStride);

        let pos: number;
        try {
            pos = view.posAtDOM(el, 0);
        } catch {
            continue;
        }

        const nodeType = el.getAttribute("class") || "";
        const isSpanning = endsOnPage > startsOnPage;
        const info: PageNodeInfo = { pos, nodeType, dom: el, startsOnPage, endsOnPage, isSpanning };

        // Log spanning dialogue/parenthetical nodes
        if (isSpanning && (nodeType.includes("dialogue") || nodeType.includes("parenthetical"))) {
            spanningDialogues.push({ nodeType, offsetTop, offsetBottom, startsOnPage, endsOnPage });
        }

        // Add to primary page (where it starts)
        if (startsOnPage < pages.length) {
            pages[startsOnPage].nodes.push(info);
        }

        // If spanning, add to continuation pages as a spanning node
        if (isSpanning) {
            for (let pageIdx = startsOnPage + 1; pageIdx <= endsOnPage && pageIdx < pages.length; pageIdx++) {
                pages[pageIdx].spanningNodes.push(info);
            }
        }
    }

    if (spanningDialogues.length > 0) {
        debugLog("Spanning dialogue/parenthetical nodes found:", spanningDialogues);
    }

    for (const page of pages) {
        if (page.nodes.length > 0) {
            // firstNode = first node that natively starts on this page (not a continuation)
            page.firstNode = page.nodes[0];
            page.lastNode = page.nodes[page.nodes.length - 1];
        }
    }

    // Log pages with spanning nodes
    const pagesWithSpanning = pages.filter(p => p.spanningNodes.length > 0);
    if (pagesWithSpanning.length > 0) {
        debugLog("Pages with spanning nodes:", pagesWithSpanning.map(p => ({
            pageNumber: p.pageNumber,
            spanningCount: p.spanningNodes.length,
            spanningTypes: p.spanningNodes.map(n => n.nodeType)
        })));
    }

    return { pageMap: pages, breakers, pageStride };
}

/**
 * Applies page-first CSS class on the first content node of each page.
 * Spanning nodes that continue from a previous page are NOT marked page-first.
 * page-last is not marked — it is deducible as the previous sibling of a page-first node.
 *
 * IMPORTANT: Must be called while ProseMirror's DOM observer is paused
 * (view.domObserver.stop/start), otherwise PM sees the class mutations,
 * tries to reconcile (stripping our classes), which triggers another
 * view.update() → infinite loop.
 */
function applyPageClasses(editorDom: HTMLElement, pageMap: PageMap) {
    const oldFirst = editorDom.querySelectorAll(`.${PAGE_FIRST_CLASS}`);
    for (const el of oldFirst) el.classList.remove(PAGE_FIRST_CLASS);

    for (const page of pageMap) {
        if (page.firstNode) {
            page.firstNode.dom.classList.add(PAGE_FIRST_CLASS);
        }
    }
}

/**
 * Pushes character/scene-heading nodes that are too close to a page break
 * down to the next page by adding margin-top.
 * Uses absolute positioning (offsetTop) instead of getBoundingClientRect()
 * to avoid layout thrashing.
 * Must be called while DOM observer is paused.
 *
 * @param pageHeight - Visible content area height (without gap)
 */
function applyOrphanPushdown(editorDom: HTMLElement, pageHeight: number) {
    // Clear old pushdown margins
    const oldPushdown = editorDom.querySelectorAll(`[${ORPHAN_PUSHDOWN_ATTR}]`);
    for (const el of oldPushdown) {
        (el as HTMLElement).style.marginTop = "";
        el.removeAttribute(ORPHAN_PUSHDOWN_ATTR);
    }

    // Measure actual breaker height
    const { breakerHeight } = collectBreakers(editorDom);
    const pageStride = pageHeight + breakerHeight;

    if (pageStride <= 0 || breakerHeight === 0) return;

    // Find character and scene-heading nodes
    const candidates = editorDom.querySelectorAll(":scope > p.character, :scope > p.scene-heading");

    for (const node of candidates) {
        const el = node as HTMLElement;
        const offsetY = el.offsetTop;
        const positionInPage = offsetY % pageStride;
        // Distance to end of content area (not including gap)
        const distanceToPageEnd = pageHeight - positionInPage;

        // If close to page boundary (within threshold), push to next page
        if (distanceToPageEnd < ORPHAN_THRESHOLD_PX && distanceToPageEnd > 0) {
            // Push past the page end + gap + buffer
            const marginNeeded = distanceToPageEnd + breakerHeight + 10;
            el.style.marginTop = `${marginNeeded}px`;
            el.setAttribute(ORPHAN_PUSHDOWN_ATTR, "true");
        }
    }
}


export const PagePositionExtension = Extension.create<PagePositionOptions>({
    name: "pagePosition",

    addOptions() {
        return {
            pageHeight: 818, // Default to LETTER page height
        };
    },

    addStorage() {
        return {
            pageMap: [] as PageMap,
        };
    },

    addProseMirrorPlugins() {
        const extensionStorage = this.storage;
        const { pageHeight } = this.options;

        debugLog("Extension initialized", { pageHeight });

        return [
            new Plugin({
                key: pagePositionPluginKey,
                view(view: EditorView) {
                    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
                    let rafId: number | null = null;
                    let lastDocSize = view.state.doc.content.size;
                    let lastPageStride = 0; // Cache for selection tracking

                    function scheduleDetection(v: EditorView, immediate = false) {
                        if (debounceTimeout !== null) {
                            clearTimeout(debounceTimeout);
                            debounceTimeout = null;
                        }
                        if (rafId !== null) {
                            cancelAnimationFrame(rafId);
                            rafId = null;
                        }

                        const delay = immediate ? 0 : 150; // Debounce non-immediate calls
                        debounceTimeout = setTimeout(() => {
                            debounceTimeout = null;
                            // Double-RAF: first RAF lets pagination's own RAF run,
                            // second RAF runs after the browser has reflowed.
                            rafId = requestAnimationFrame(() => {
                                rafId = requestAnimationFrame(() => {
                                    rafId = null;
                                    runDetection(v);
                                });
                            });
                        }, delay);
                    }

                    function runDetection(v: EditorView) {
                        if (!v.dom || !v.dom.isConnected) return;

                        const editorDom = v.dom as HTMLElement;
                        const domObserver = (v as any).domObserver;

                        // Apply orphan pushdown using absolute positioning
                        domObserver?.stop();
                        try {
                            applyOrphanPushdown(editorDom, pageHeight);
                        } finally {
                            domObserver?.start();
                        }

                        const { pageMap, breakers, pageStride } = detectPagePositions(v, pageHeight);
                        lastPageStride = pageStride; // Cache for selection tracking

                        // Pause PM's DOM observer so our class changes don't
                        // trigger mutation → reconcile → view.update() loops.
                        domObserver?.stop();
                        try {
                            applyPageClasses(editorDom, pageMap);
                            applyMoreContdOverlays(editorDom, pageMap, breakers);
                        } finally {
                            domObserver?.start();
                        }

                        extensionStorage.pageMap = pageMap;
                    }

                    // Schedule initial detection after view mounts.
                    // Pagination decorations need time to render and settle.
                    scheduleDetection(view, true);

                    return {
                        update(v: EditorView, prevState) {
                            // Log selection page info on every update
                            if (lastPageStride > 0) {
                                const sel = v.state.selection;
                                const $pos = sel.$anchor;
                                try {
                                    const domAtPos = v.domAtPos($pos.pos);
                                    let el = domAtPos.node as HTMLElement;
                                    // Walk up to find the paragraph element
                                    while (el && el.nodeName !== "P" && el !== v.dom) {
                                        el = el.parentElement as HTMLElement;
                                    }
                                    if (el && el.nodeName === "P") {
                                        const offsetTop = el.offsetTop;
                                        const currentPage = getPageIndex(offsetTop, lastPageStride) + 1; // +1 for 1-based page number
                                        const posInPage = offsetTop % lastPageStride;
                                        const nodeType = el.getAttribute("class") || "";
                                        debugLog(`Selection: page ${currentPage}, type="${nodeType}", offsetTop=${offsetTop}, posInPage=${posInPage}, pageStride=${lastPageStride}`);
                                    }
                                } catch (e) {
                                    // Ignore errors during selection tracking
                                }
                            }

                            // Only re-detect on document changes, not selection-only changes
                            const docChanged = v.state.doc.content.size !== lastDocSize;
                            if (docChanged) {
                                lastDocSize = v.state.doc.content.size;
                                scheduleDetection(v);
                            }
                        },
                        destroy() {
                            if (debounceTimeout !== null) {
                                clearTimeout(debounceTimeout);
                            }
                            if (rafId !== null) {
                                cancelAnimationFrame(rafId);
                            }
                        },
                    };
                },
            }),
        ];
    },
});
