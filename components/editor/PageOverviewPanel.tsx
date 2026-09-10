"use client";

import { memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/react";
import { DOMSerializer, Fragment, Node as PMNode } from "@tiptap/pm/model";
import { ProjectContext } from "@src/context/ProjectContext";
import { PAGE_GRID_COLUMNS_MAX, PAGE_GRID_COLUMNS_MIN, useViewContext } from "@src/context/ViewContext";
import { PageEntry, readScriptPages } from "@src/lib/screenplay/page-overview";
import { focusOnPosition, SCREENPLAY_FORMATS } from "@src/lib/screenplay/editor";
import { useIsPhone } from "@src/lib/utils/hooks";
import { join } from "@src/lib/utils/misc";

import styles from "./PageOverviewPanel.module.css";

/** Grid metrics, mirrored in the CSS module. Used to work out how wide one
 *  track came out, which is what the page inside a frame is scaled to. The
 *  frames themselves are laid out by CSS from the same numbers, so a drift here
 *  mis-scales the drawing inside a page — it can never move the page itself. */
const GRID_GAP = 24;
const GRID_PADDING_X = 20;

/** Pages per row on a phone. Fixed, and the pill that would change it is hidden
 *  there: one across is the editor without the editing, and three across a
 *  390pt screen stops being readable as pages — which leaves nothing to pick. */
const PAGE_GRID_COLUMNS_PHONE = 2;

/** How long the document has to sit still before the page list is re-read.
 *  Long enough for the pagination plugin to have settled on the layout the
 *  thumbnails are about to be sliced from. */
const REPAGINATION_SETTLE_MS = 250;

/** …but never wait longer than this. A plain trailing debounce keeps deferring
 *  while a collaborator types, so a preview watched during a long stretch of
 *  someone else's writing would sit frozen until they paused. A refresh costs
 *  about two milliseconds (only the pages near the viewport are redrawn), so
 *  once a second while someone types is far cheaper than being wrong. */
const REPAGINATION_MAX_WAIT_MS = 1000;

/**
 * Reports when a thumbnail comes within a viewport of the scroll port.
 *
 * One observer for the whole grid rather than one per page: a feature is 125
 * thumbnails, and the browser recomputes every observer's intersections on each
 * scrolled frame — work that lands squarely in the frame budget the scroll
 * needs. Registering many targets with one observer is a single pass.
 */
type NearWatcher = { observe: (el: Element, onChange: (near: boolean) => void) => () => void };

const useNearWatcher = (): NearWatcher => {
    const handlers = useRef<Map<Element, (near: boolean) => void>>(new Map());
    const observerRef = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
        return () => {
            observerRef.current?.disconnect();
            observerRef.current = null;
        };
    }, []);

    return useMemo(
        () => ({
            observe: (el, onChange) => {
                handlers.current.set(el, onChange);
                // Built on the first registration rather than up front: a child's
                // effect runs before its parent's, so a watcher created in this
                // component's own effect would not exist yet when the first
                // thumbnail asks to be observed. Everything here runs from an
                // effect, so no ref is touched during a render.
                if (!observerRef.current && typeof IntersectionObserver !== "undefined") {
                    observerRef.current = new IntersectionObserver(
                        (entries) => {
                            for (const entry of entries) handlers.current.get(entry.target)?.(entry.isIntersecting);
                        },
                        // A viewport of runway, so a page is filled well before
                        // it is looked at.
                        { rootMargin: "100% 0px" },
                    );
                }
                observerRef.current?.observe(el);
                return () => {
                    handlers.current.delete(el);
                    observerRef.current?.unobserve(el);
                };
            },
        }),
        [],
    );
};

/** The editor DOM's own classes and CSS variables, which every thumbnail copies
 *  so it renders under exactly the settings the script is written under. */
type EditorChrome = { className: string; cssText: string };

/**
 * Classes on the editor element that describe *the editor*, not the script, and
 * so must not travel to a thumbnail: `pagination` imposes its own width (with
 * !important) and a full page's min-height, `endless-scroll` disables the
 * per-page top-margin reset these thumbnails depend on, and the focus/selection
 * flags belong to the live caret.
 */
const NON_THUMBNAIL_CLASSES = new Set([
    // Re-added explicitly on the thumbnail body, so copying it would duplicate it.
    "ProseMirror",
    "pagination",
    "endless-scroll",
    "ProseMirror-focused",
    "ProseMirror-hideselection",
]);

const readChrome = (editor: Editor): EditorChrome => {
    const dom = editor.view.dom;
    return {
        className: Array.from(dom.classList)
            .filter((c) => !NON_THUMBNAIL_CLASSES.has(c))
            .join(" "),
        // Carries every custom property the editor is running with: the page
        // geometry synced by the pagination extension plus the per-element
        // margins and styles DocumentEditorPanel writes from user settings.
        cssText: dom.style.cssText,
    };
};

type PageThumbnailProps = {
    page: PageEntry;
    doc: PMNode;
    serializer: DOMSerializer;
    chrome: EditorChrome;
    /** Draw immediately instead of waiting to be reported on screen — see
     *  eagerCount. Only read when the thumbnail first mounts. */
    eager: boolean;
    near: NearWatcher;
    openLabel: string;
    onOpen: (page: PageEntry) => void;
};

/**
 * One page, drawn at its canonical size and scaled down by the grid.
 *
 * The content is serialized straight out of the document rather than cloned
 * from the editor's DOM: the editor is parked while this view is up (its
 * subtree is skipped, so nothing there is measurable), and a page's slice is a
 * fraction of the DOM a full clone would cost. Laying that slice out in a
 * page-shaped box with the editor's own variables reproduces the page — the
 * blank at the bottom of a short page is exactly the freespace pagination left
 * there, because the same content wraps the same way at the same width.
 */
const PageThumbnail = memo(({ page, doc, serializer, chrome, eager, near, openLabel, onOpen }: PageThumbnailProps) => {
    const frameRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    /**
     * Whether this page is within reach of the viewport, held in a ref rather
     * than in state on purpose. Scrolling a feature crosses this boundary
     * constantly in both directions, and routing each crossing through
     * setState would re-render a component per page per scroll — React work
     * charged to the one moment that has no budget for it. Nothing about the
     * markup depends on it, so nothing needs to re-render.
     */
    const nearRef = useRef(eager);
    /** The document this page was last drawn from, and the content drawn. */
    const drawnDocRef = useRef<PMNode | null>(null);
    const renderedRef = useRef<Fragment | null>(null);

    const fill = useCallback(() => {
        const host = bodyRef.current;
        // Off-screen pages are left alone until they are scrolled back to. This
        // is what stops a collaborator's edit from costing more on a long script
        // than a short one: a repagination renumbers every page after the edit,
        // and rebuilding all of them would scale with the document instead of
        // with the screen. Coming back into view calls this again, and the
        // guards below then see content that really did change.
        if (!nearRef.current || !host) return;

        // The common case by far, and the reason scrolling is free once a page
        // has been drawn: same document, so whatever is on screen is current.
        // A pointer comparison, before any slicing.
        if (drawnDocRef.current === doc) return;
        drawnDocRef.current = doc;

        const content = doc.slice(page.from, page.to).content;
        // Most pages survive an edit untouched, holding the very same nodes at
        // shifted positions. ProseMirror keeps node identity across a
        // transaction, so this comparison short-circuits on pointer equality
        // and skips the serialize and the relayout that would follow it.
        if (renderedRef.current?.eq(content)) return;
        renderedRef.current = content;

        const fragment = serializer.serializeFragment(content);
        // The editor zeroes the top margin of whichever block opens a page (the
        // pagination-doc-start decoration). Without the same reset here every
        // thumbnail would start one line lower than the page it stands for.
        fragment.firstElementChild?.classList.add("pagination-doc-start");
        host.replaceChildren(fragment);
        // Deliberately nothing that empties the host again: a page keeps what it
        // has drawn when it scrolls away, so returning to it is instant and
        // never flashes an empty sheet.
    }, [doc, page.from, page.to, serializer]);

    // The observer calls straight into the latest fill, without going through a
    // render to get there.
    const fillRef = useRef(fill);
    useEffect(() => {
        fillRef.current = fill;
    }, [fill]);

    useEffect(() => {
        const el = frameRef.current;
        if (!el) return;
        return near.observe(el, (isNear) => {
            nearRef.current = isNear;
            // Intersection callbacks are delivered after the frame has been
            // rendered, so a page streaming in never delays a paint.
            if (isNear) fillRef.current();
        });
    }, [near]);

    // The opening screenful is drawn before the browser paints, so the view
    // never appears as a grid of blank sheets. Re-runs when the document
    // changes, which is how an on-screen page picks up a collaborator's edit.
    useLayoutEffect(() => {
        if (eager) fill();
    }, [eager, fill]);

    // Every other page redraws after the frame has been presented.
    useEffect(() => {
        if (!eager) fill();
    }, [eager, fill]);

    useLayoutEffect(() => {
        const host = bodyRef.current;
        if (host) host.style.cssText = chrome.cssText;
    }, [chrome.cssText]);

    return (
        // A div rather than a button: the sheet is block content, which a button
        // may not contain. Kept operable by keyboard in its place.
        <div className={styles.cell}>
            <div
                ref={frameRef}
                role="button"
                tabIndex={0}
                className={styles.sheet_frame}
                title={openLabel}
                aria-label={openLabel}
                onClick={() => onOpen(page)}
                onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    onOpen(page);
                }}
            >
                <div className={styles.sheet}>
                    {/* Class list copied from the live editor, so scene numbering,
                        heading spacing and production locking match the script. */}
                    <div ref={bodyRef} className={join(styles.page_body, "ProseMirror", chrome.className)} />
                </div>
            </div>
            <span className={styles.page_label}>{page.label}</span>
        </div>
    );
});

PageThumbnail.displayName = "PageThumbnail";

/**
 * The screenplay as a wall of page thumbnails — every page of the script at
 * once, in order, at whatever density the panel menu's zoom is set to. Clicking
 * one returns to the editor scrolled to that page.
 *
 * It is a read-only overview by design: the pages are a rendering of the
 * document, not a second editor for it. What it adds over the script view is
 * shape — where the dialogue runs long, where a scene sprawls, where the white
 * space sits — which is only legible when the pages sit side by side.
 */
const PageOverviewPanel = () => {
    const t = useTranslations("navbar");
    const { editor, pageFormat } = useContext(ProjectContext);
    const { timelineOpen, pageGridColumns, setScreenplayView } = useViewContext();
    const isPhone = useIsPhone();
    const near = useNearWatcher();

    // Held as state, not a ref: the panel renders two different trees (the grid
    // and the not-ready message), so React remounts this element when the editor
    // arrives and a ref would leave the observer watching a detached node —
    // measuring nothing, forever.
    const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
    const [panel, setPanel] = useState({ width: 0, height: 0 });
    // Bumped after an editor update (a collaborator's edit, or a settings change
    // that forces a repagination) to re-read the page boundaries.
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        if (!editor) return;
        // Settled rather than immediate, for two reasons: pagination recomputes
        // off the back of the transaction, so reading breaks the instant an
        // update lands can catch the previous layout; and a collaborator typing
        // would otherwise re-serialize every mounted page on every keystroke.
        let timer: ReturnType<typeof setTimeout> | null = null;
        let waitingSince = 0;
        const bump = () => {
            const now = Date.now();
            if (!waitingSince) waitingSince = now;
            if (timer) clearTimeout(timer);
            // Wait for the document to settle, but never past the ceiling — see
            // REPAGINATION_MAX_WAIT_MS.
            const wait = Math.max(0, Math.min(REPAGINATION_SETTLE_MS, waitingSince + REPAGINATION_MAX_WAIT_MS - now));
            timer = setTimeout(() => {
                timer = null;
                waitingSince = 0;
                setRevision((prev) => prev + 1);
            }, wait);
        };
        editor.on("update", bump);
        return () => {
            if (timer) clearTimeout(timer);
            editor.off("update", bump);
        };
    }, [editor]);

    // Layout effect, not a passive one: the grid can only be sized once the panel
    // has been measured, and measuring after the paint would show a frame of
    // unsized grid first. React flushes the state this sets before the browser
    // paints, so the overview's very first frame is already at its final size.
    useLayoutEffect(() => {
        if (!containerEl) return;
        const measure = () =>
            setPanel((prev) =>
                prev.width === containerEl.clientWidth && prev.height === containerEl.clientHeight
                    ? prev
                    : { width: containerEl.clientWidth, height: containerEl.clientHeight },
            );
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(containerEl);
        return () => observer.disconnect();
    }, [containerEl]);

    // Document, page boundaries and editor chrome are read together and kept
    // together: the boundaries are positions *in* this doc, and pairing them
    // with a doc read separately at render time would slice a page against a
    // document it doesn't describe — out of range, the moment an edit shortens
    // the script.
    const snapshot = useMemo(
        () =>
            editor && !editor.isDestroyed
                ? { doc: editor.state.doc, pages: readScriptPages(editor), chrome: readChrome(editor) }
                : null,
        // `revision` is the dependency that matters — the editor instance itself
        // is stable across the edits that move page boundaries.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [editor, revision],
    );
    const serializer = useMemo(() => (editor ? DOMSerializer.fromSchema(editor.schema) : null), [editor]);

    const pageSize = SCREENPLAY_FORMATS[pageFormat as keyof typeof SCREENPLAY_FORMATS] ?? SCREENPLAY_FORMATS.LETTER;

    const columns = isPhone
        ? PAGE_GRID_COLUMNS_PHONE
        : Math.min(PAGE_GRID_COLUMNS_MAX, Math.max(PAGE_GRID_COLUMNS_MIN, pageGridColumns));
    // How far down the page has to be scaled to fill one track. The track's own
    // width is CSS's business (`1fr`); this reproduces the same arithmetic to
    // decide what to draw inside it.
    const scale = useMemo(() => {
        if (!panel.width) return 0;
        const available = panel.width - GRID_PADDING_X * 2 - GRID_GAP * (columns - 1);
        return Math.max(0, available / columns / pageSize.pageWidth);
    }, [panel.width, columns, pageSize.pageWidth]);

    // How many pages to draw without waiting to be told they are on screen.
    // The intersection observer only reports after the first paint, so leaving
    // every page to it means the overview opens as a grid of blank sheets that
    // fill in a frame later. These are drawn up front instead.
    //
    // Row height is taken as the page alone, ignoring the caption and the gap
    // beneath it. That overestimates how many rows fit, which is the safe
    // direction — a few pages drawn early costs a fraction of a millisecond
    // each, where one too few is a visibly empty page.
    const eagerCount = useMemo(() => {
        if (!scale || !panel.height) return 0;
        const rows = Math.ceil(panel.height / (pageSize.pageHeight * scale)) + 1;
        return rows * columns;
    }, [scale, panel.height, pageSize.pageHeight, columns]);

    const handleOpen = useCallback(
        (page: PageEntry) => {
            setScreenplayView("editor");
            if (!editor || editor.isDestroyed) return;
            const size = editor.state.doc.content.size;
            const pos = Math.max(1, Math.min(size - 1, page.caret));
            // The editor is parked until the view switch has rendered — its
            // subtree is skipped, so it has no geometry to scroll to yet. One
            // frame commits the switch, the second lets layout catch up.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (!editor.isDestroyed) focusOnPosition(editor, pos);
                });
            });
        },
        [editor, setScreenplayView],
    );

    const containerClass = join(styles.container, timelineOpen ? styles.timeline_open : "");

    if (!snapshot || !serializer) {
        return (
            <div ref={setContainerEl} className={containerClass}>
                <div className={styles.empty_state}>{t("viewPagesEmpty")}</div>
            </div>
        );
    }

    // Both branches return the same element at the root, so React keeps the
    // container (and its resize observation) across the not-ready → grid switch.
    return (
        <div ref={setContainerEl} className={containerClass}>
            {/* Rendered unconditionally, including before the first measurement.
                Every frame here is sized by CSS, so the grid that appears is the
                grid that stays; only the drawing inside the frames waits on the
                scale, and the measuring layout effect lands that before the
                browser paints. */}
            <div
                className={styles.grid}
                style={
                    {
                        "--pages-per-row": columns,
                        "--page-scale": scale,
                        "--page-width": `${pageSize.pageWidth}px`,
                        "--page-height": `${pageSize.pageHeight}px`,
                        // Unitless, because aspect-ratio takes a ratio of
                        // numbers rather than of lengths.
                        "--page-ratio": `${pageSize.pageWidth} / ${pageSize.pageHeight}`,
                    } as React.CSSProperties
                }
            >
                {snapshot.pages.map((page, index) => (
                    <PageThumbnail
                        key={`${index}-${page.from}`}
                        page={page}
                        doc={snapshot.doc}
                        serializer={serializer}
                        chrome={snapshot.chrome}
                        eager={index < eagerCount}
                        near={near}
                        openLabel={t("viewPagesOpen", { page: page.label })}
                        onOpen={handleOpen}
                    />
                ))}
            </div>
        </div>
    );
};

export default PageOverviewPanel;
