"use client";

import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { EditorContent } from "@tiptap/react";

import { applyElement, insertElement, SCREENPLAY_FORMATS } from "@src/lib/screenplay/editor";
import { ScreenplayElement } from "@src/lib/utils/enums";
import { Eye, GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { DUAL_DIALOGUE_COLUMN } from "@src/lib/screenplay/nodes/dual-dialogue-column-node";
import { DEFAULT_ELEMENT_MARGINS, DEFAULT_ELEMENT_STYLES } from "@src/lib/project/project-state";
import { join } from "@src/lib/utils/misc";
import { useIsPhone, useProjectMembership, useSettings } from "@src/lib/utils/hooks";
import { ProjectContext } from "@src/context/ProjectContext";
import { useViewContext } from "@src/context/ViewContext";
import { ContextMenuType } from "@components/editor/sidebar/ContextMenu";
import { UserContext } from "@src/context/UserContext";
import { useUser } from "@src/lib/utils/hooks";
import CommentGutter from "@components/editor/CommentGutter";
import Loading from "@components/utils/Loading";

import { TextSelection, Transaction } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";
import { DocumentEditorConfig, EDITOR_INPUT_ATTRIBUTES } from "@src/lib/editor/document-editor-config";
import { useDocumentComments } from "@src/lib/editor/use-document-comments";
import { registerAddComment, unregisterAddComment } from "@src/lib/editor/comment-actions";
import { getNodeIdAtPos, transactionDeletesNode } from "@src/lib/screenplay/comment-anchors";
import { useDocumentEditor } from "@src/lib/editor/use-document-editor";
import { useViewModeScrollAnchor } from "@src/lib/editor/use-view-mode-scroll-anchor";
import { useKeyboardCaretVisibility } from "@src/lib/editor/use-keyboard-caret-visibility";
import { useChromeHide } from "@src/lib/editor/use-chrome-hide";
import { centerCaretInView, focusEditorAtCoords } from "@src/lib/editor/focus-in-viewport";
import { getSpellErrorAt } from "@src/lib/spellcheck/spellcheck-extension";
import type { SuggestionData } from "@components/editor/SuggestionMenu";

import styles from "./EditorPanel.module.css";

export interface DocumentEditorPanelProps {
    config: DocumentEditorConfig;
    isVisible: boolean;
    /** Called when the Tiptap editor instance is created or destroyed. */
    onEditorCreated?: (editor: import("@tiptap/react").Editor | null) => void;
    // Screenplay-only props
    suggestions?: string[];
    updateSuggestions?: (suggestions: string[]) => void;
    suggestionData?: SuggestionData;
    updateSuggestionData?: (data: SuggestionData) => void;
    userKeybinds?: Record<string, string>;
    /** Override the focus type reported to ProjectContext on focus. */
    focusedTypeOverride?: "screenplay" | "title" | "draft";
}

// useLayoutEffect on the server warns; fall back to useEffect there. The view
// mode scaling and its scroll re-anchoring must run before paint, so they need
// the layout variant.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const DocumentEditorPanel = ({
    config,
    isVisible,
    onEditorCreated,
    suggestions = [],
    updateSuggestions,
    updateSuggestionData,
    userKeybinds,
    focusedTypeOverride,
}: DocumentEditorPanelProps) => {
    const { membership, isLoading, isLocalOnly } = useProjectMembership();
    const { updateContextMenu } = useContext(UserContext);
    const projectCtx = useContext(ProjectContext);
    const {
        isYjsReady,
        isReadOnly,
        selectedElement,
        setSelectedElement,
        setSelectedStyles,
        pageFormat,
        pageMargins,
        displaySceneNumbers,
        sceneHeadingSpacing,
        sceneNumberOnRight,
        contdLabel,
        moreLabel,
        showContdDialogue,
        showContdPageBreak,
        headerLeft,
        headerMiddle,
        headerRight,
        showFirstPageHeader,
        footerLeft,
        footerMiddle,
        footerRight,
        showFirstPageFooter,
        elementMargins,
        elementStyles,
        sceneLocking,
        setFocusedEditorType,
        setSelectedTitlePageElement,
        repository,
    } = projectCtx;
    const { settings } = useSettings();
    const {
        isEndlessScroll,
        onBeforeEndlessScrollChange,
        setChromeHidden,
        mobileEditMode,
        setMobileEditMode,
        timelineOpen,
        zoomLevel,
    } = useViewContext();
    const { user } = useUser();
    const isPhone = useIsPhone();

    const [isEditorReady, setIsEditorReady] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);
    // Phone-only draggable scroll handle: a fixed-size grab handle (styled like
    // the sidebar edge toggles) that rides the right edge tracking scroll
    // position, so it's easy to grab and drag the page up/down. Shown while
    // actively scrolling (or being dragged) and faded out shortly after, so it
    // never sits on top of the writing while at rest.
    const [showScrollThumb, setShowScrollThumb] = useState(false);
    const [canScrollThumb, setCanScrollThumb] = useState(false);
    // The handle's position is written straight to the DOM (not React state) so
    // tracking the scroll gesture never re-renders this (heavy) panel — that
    // per-event re-render is what made the scroll-linked chrome-hide stutter
    // against the finger. thumbTopRef seeds the transform when the handle
    // (re)mounts; updateThumb writes it imperatively thereafter.
    const scrollHandleRef = useRef<HTMLDivElement | null>(null);
    const thumbTopRef = useRef(0);
    const scrollIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isDraggingThumb = useRef(false);
    // The draggable scroll track element, measured to derive the handle's travel
    // range (see thumbTravel) independently of the container's changing height.
    const scrollTrackRef = useRef<HTMLDivElement | null>(null);
    // Coalesces all scroll-driven work into a single update per animation frame
    // (see onScroll). A burst of scroll events then costs one layout, aligned to
    // the paint cycle, so the chrome stays glued to the scroll instead of lagging.
    const scrollRafRef = useRef<number | null>(null);
    // Pending single-tap timer for the phone reader. A tap arms it; a second tap
    // within the window cancels it and counts as a double tap (see handleReaderTap).
    const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Callback ref stored in state so the effects below re-run when the scroll
    // container actually mounts (it may render after a Loading fallback).
    const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);

    const projectState = repository?.getState();
    const commentsMap = useMemo(
        () => (projectState && config.features.comments ? config.getCommentsMap(projectState) : null),
        // Re-derive only when projectState identity changes (Yjs doc swap on project change)
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [projectState],
    );

    const commentOps = useDocumentComments(commentsMap, repository);

    const keybinds = userKeybinds ?? settings?.keybinds;

    const updateActiveElement = useCallback(
        (element: ScreenplayElement) => {
            setSelectedElement(element);
        },
        [setSelectedElement],
    );

    const editor = useDocumentEditor(config, {
        setActiveElement: updateActiveElement,
        setSelectedStyles,
        updateSuggestions,
        updateSuggestionsData: updateSuggestionData,
        userKeybinds: keybinds,
        setSelectedTitlePageElement,
    });

    useEffect(() => {
        onEditorCreated?.(editor);
        return () => {
            onEditorCreated?.(null);
        };
    }, [editor, onEditorCreated]);

    // Editability gate.
    //
    // Read-only enforcement for VIEWER role: the server already drops doc writes
    // from viewers (see protocol.ts), but disabling tiptap locally avoids a
    // confusing "I typed but nothing happened" experience — keystrokes are
    // blocked at the editor level and collaboration carets/awareness still render.
    //
    // Phone reader mode: on phone the editor stays non-editable until the user
    // enters edit mode via the pen button, so the default experience is a
    // keyboard-free reader. Off phone, mobileEditMode is ignored. Turning it off
    // (contenteditable=false) also dismisses the on-screen keyboard; blur too so
    // focus doesn't linger.
    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        const editable = !isReadOnly && (!isPhone || mobileEditMode);
        editor.setEditable(editable);
        if (!editable && editor.isFocused) editor.commands.blur();
    }, [editor, isReadOnly, isPhone, mobileEditMode]);

    /**
     * Let go of the DOM focus and the document selection when this panel is
     * swapped out for another (a board, a tree document, the title page).
     *
     * The panel is not unmounted — it is parked behind `content-visibility:
     * hidden` (see SplitPanelContainer .panel_hidden) so a 120-page ProseMirror
     * DOM doesn't have to reinitialise on the way back. A parked editor left
     * focused still keeps a document-level `selectionchange` listener live and
     * WebKit still chasing its caret, which is needless upkeep for a panel the
     * user can't see or type into — this drops both.
     *
     * Blur first, then drop the range: clearing the selection while the
     * contenteditable still holds focus just makes ProseMirror put it back.
     */
    useEffect(() => {
        if (isVisible || !editor || editor.isDestroyed) return;
        const dom = editor.view?.dom;
        if (!dom) return;
        if (editor.isFocused) editor.commands.blur();
        const selection = typeof window !== "undefined" ? window.getSelection() : null;
        if (selection?.anchorNode && dom.contains(selection.anchorNode)) selection.removeAllRanges();
    }, [isVisible, editor]);

    /**
     * Rebuild the editor's rendering when it comes back from being parked.
     *
     * Parking leaves the DOM in place under `content-visibility: hidden`, and
     * anything that changes it meanwhile — the endless/paged toggle in the
     * footer, a layout setting, a collaborator's edit — lands on a subtree the
     * engine is not rendering. WebKit does not reliably catch up when that
     * subtree is shown again: on iOS the paged screenplay came back from the
     * page overview with stale paint from before it was parked — endless-mode
     * margins, text rasterised at the wrong scale — over part of the page, and
     * Safari 26's release notes list a run of content-visibility fixes (repaint,
     * geometry, layout marking) that earlier iOS does not have.
     *
     * Toggling `display` across a forced layout is the one thing every engine
     * treats as a fresh mount — renderers and compositing layers are torn down
     * and built again — which is the path the first render takes and the one
     * known to be right. It costs a layout of the document on the way back, once
     * per view switch; nothing is re-initialised. The scroll offset is put back
     * because the momentarily empty container clamps it to 0.
     *
     * Layout effect, so the rebuild lands before the browser paints the return,
     * and before the effect below re-focuses the editor.
     */
    const wasParkedRef = useRef(false);
    useIsoLayoutEffect(() => {
        if (!isVisible) {
            wasParkedRef.current = true;
            return;
        }
        if (!wasParkedRef.current) return;
        wasParkedRef.current = false;

        const dom = editor?.view?.dom;
        const container = containerEl;
        if (!dom || !container || editor.isDestroyed) return;

        const { scrollTop, scrollLeft } = container;
        dom.style.display = "none";
        // Flush: the editor's renderers are torn down here.
        void dom.offsetHeight;
        dom.style.removeProperty("display");
        // Assigning the offsets flushes again, against the rebuilt layout.
        container.scrollTop = scrollTop;
        container.scrollLeft = scrollLeft;
    }, [isVisible, editor, containerEl]);

    // Marker class on the editor DOM so global CSS (scenarly.css) can drop the
    // first-of-page top-margin reset in endless-scroll mode. There the page-break
    // widgets are hidden, so the reset would otherwise make each page's first
    // node stick to the previous page's content.
    //
    // Layout effect, not a passive one: the wrapper's own mode class lands during
    // the commit, so a passive toggle would leave one painted frame where the two
    // disagree — and, more importantly, the scroll re-anchoring below has to
    // measure the *finished* mode layout, not a half-applied one.
    useIsoLayoutEffect(() => {
        const el = editor?.view?.dom;
        if (!el) return;
        el.classList.toggle("endless-scroll", isEndlessScroll);
    }, [editor, isEndlessScroll]);

    // Delay the reveal so the first pagination pass lands before the panel fades in.
    useEffect(() => {
        if (editor && isYjsReady) {
            const timer = setTimeout(() => setIsEditorReady(true), 500);
            return () => clearTimeout(timer);
        }
    }, [editor, isYjsReady]);

    const pageSize = SCREENPLAY_FORMATS[pageFormat as keyof typeof SCREENPLAY_FORMATS];
    // Whether the phone's automatic fit-to-width applies (paged view only — see
    // the effect below). Desktop always shows the page at its canonical width.
    const isPagedFit = isPhone && !isEndlessScroll && !!pageSize;
    // The writer's own zoom, or 1 where it does not apply — a neutral factor
    // rather than a special case, so every formula below stays the same shape.
    // It does not apply:
    //  - on phone, where the two view modes already are the zoom control:
    //    endless reflows the text to the viewport at full size, and paged fits
    //    the whole page to the screen. A third scale on top of those has nothing
    //    left to offer, and would only give a phone-sized screen a page too wide
    //    or too small to read.
    //  - in endless scroll, which reflows instead of drawing a page to scale.
    const userZoom = isPhone || isEndlessScroll ? 1 : zoomLevel / 100;
    // Anything to scale at all. Drives the `zoomed` class, and with it whether a
    // transform is applied to the editor at all. Gated on a known page size
    // because the class's margins are expressed in --page-width: without one they
    // would fail to substitute, computing to 0 and left-aligning the page.
    const zoomActive = !!pageSize && (isPagedFit || userZoom !== 1);

    // ---- Display scale (phone fit + user zoom) ----
    // The rendered page scale is the product of two independent factors, kept as
    // separate CSS variables and multiplied in CSS (see the `.zoomed` rule in
    // EditorPanel.module.css):
    //
    //  --editor-fit       automatic, phone paged view only: shrink the canonical
    //                     page so its full width fits the viewport. Measured, so
    //                     it is maintained here rather than in React state — it
    //                     changes on every resize and rotation.
    //  --editor-user-zoom the writer's own zoom level, applied on every device
    //                     (set inline from `zoomLevel` further down). Phone
    //                     therefore zooms relative to the fitted page: 100% means
    //                     "the whole page, as wide as the screen", which is the
    //                     only sensible baseline there.
    //
    // Both are purely visual. The scale is a transform, NOT `zoom` (WebKit clamps
    // zoom-shrunk fonts to a 9px rendered minimum, inflating the screenplay font
    // — see the `.zoomed` rule for the full account), pagination is measured
    // off-screen at the canonical width, and PDF export pins `transform: none`
    // while it measures (CANONICAL_PINNED_PROPERTIES in pdf-adapter). So page
    // count, numbering, page breaks and every export are identical at every zoom.
    //
    // Endless scroll (phone) takes no scale at all: it already reflows the text
    // to the viewport at full size, and there is no fixed page rectangle to
    // scale — hence `userZoom` collapsing to 1 there.
    //
    // Layout effect so the scale is in place before the browser paints — and
    // before the scroll compensation and re-anchoring below measure it.
    useIsoLayoutEffect(() => {
        const container = containerEl;
        if (!container) return;

        const pageSize = SCREENPLAY_FORMATS[pageFormat as keyof typeof SCREENPLAY_FORMATS];
        // Nothing is scaled: drop both variables so the editor renders at 1:1 with
        // no transform at all. Leaving an identity scale(1) behind would not be
        // free — a transformed contenteditable loses its caret in WebKit, and
        // scale(1) is enough to trigger it — which is why the CSS keys the whole
        // transform off the `zoomed` class instead of a neutral value.
        if (!zoomActive || !pageSize) {
            container.style.removeProperty("--editor-fit");
            container.style.removeProperty("--editor-layout-height");
            return;
        }

        let ro: ResizeObserver | undefined;
        if (isPagedFit) {
            const apply = () => {
                const avail = container.clientWidth;
                if (!avail) return;
                // Fit the full canonical page width into the viewport; never upscale.
                // Leaves a small gutter so the page edges aren't flush with the screen.
                const ratio = Math.min(1, (avail - 8) / pageSize.pageWidth);
                container.style.setProperty("--editor-fit", `${ratio}`);
            };
            apply();
            ro = new ResizeObserver(apply);
            ro.observe(container);
        } else {
            container.style.removeProperty("--editor-fit");
        }

        // transform: scale() doesn't shrink (or grow) the layout box the way `zoom`
        // did, so the CSS corrects the leftover (scale − 1) tail of the editor's
        // layout height with a margin — negative when zoomed out, positive when
        // zoomed in — so the scroll extent matches what is actually visible. Track
        // the untransformed height here (offsetHeight ignores transforms) and
        // expose it as a CSS var.
        const editorDOM = editor?.view?.dom;
        let heightObserver: ResizeObserver | undefined;
        if (editorDOM) {
            const applyHeight = () => {
                container.style.setProperty("--editor-layout-height", `${editorDOM.offsetHeight}px`);
            };
            applyHeight();
            heightObserver = new ResizeObserver(applyHeight);
            heightObserver.observe(editorDOM);
        }

        return () => {
            ro?.disconnect();
            heightObserver?.disconnect();
            container.style.removeProperty("--editor-layout-height");
        };
    }, [containerEl, isPagedFit, zoomActive, pageFormat, editor]);

    // ---- Keep the reading position across a zoom change ----
    // Unlike the endless/paged switch below — a genuine reflow, which needs the
    // content-anchored correction in useViewModeScrollAnchor — a zoom step scales
    // the whole document uniformly from its top edge (transform-origin: top left).
    // Every offset therefore moves by exactly the same ratio, so scaling scrollTop
    // by it is not an approximation but the exact answer, and the line under the
    // reader's eye stays there.
    //
    // Declared after the effect above so the new scale is already applied: writing
    // scrollTop flushes layout, and against the old (shorter) scroll extent a
    // zoom-in would simply clamp and land short.
    const prevZoomRef = useRef(zoomLevel);
    useIsoLayoutEffect(() => {
        const previous = prevZoomRef.current;
        prevZoomRef.current = zoomLevel;
        const container = containerEl;
        if (!container || previous === zoomLevel) return;
        if (container.scrollTop > 0) container.scrollTop = (container.scrollTop * zoomLevel) / previous;

        // Tell the viewport-culled overlays (the revision stripes and asterisks)
        // that what is on screen has changed. They repaint on scroll and on a
        // resize of the editor box, and a zoom step is neither: a transform leaves
        // the layout box alone, and scrolling to the same place — or being at the
        // top already — fires nothing. Their *painted* geometry stays correct
        // regardless (its coordinates are unscaled, inside the same transformed
        // subtree), but the window they cull against is in screen pixels, so
        // without this a zoom-out leaves the newly-revealed pages unpainted until
        // the next scroll. A synthetic scroll event reaches them through the
        // capture-phase window listener they already use.
        container.dispatchEvent(new Event("scroll"));
    }, [zoomLevel, containerEl]);

    // Deliberately no ⌘/Ctrl + wheel zoom here. Catching it needs a NON-PASSIVE
    // wheel listener (a passive one cannot preventDefault, so the browser would
    // zoom the whole app instead), and the browser cannot know in advance whether
    // such a handler will prevent the default — so it must route EVERY wheel
    // event over this container through the main thread before scrolling, even
    // the ordinary ones with no modifier held. That takes the editor's scrolling
    // off the compositor's fast path, and a plain scroll then stutters whenever
    // the main thread is mid-pagination. The zoom is on ⌘/Ctrl +/− and in the
    // panel menu instead; scrolling stays untouched.

    // ---- Scroll anchoring across the endless-scroll toggle ----
    // Endless and paged render the same document at very different heights, so a
    // switch would otherwise leave the reader pages away from what they were
    // looking at. Declared after the two layout effects above because it measures
    // the finished mode layout — see the hook for the full rationale.
    useViewModeScrollAnchor({
        container: containerEl,
        editor,
        viewMode: isEndlessScroll,
        onBeforeChange: onBeforeEndlessScrollChange,
    });

    // ---- Keyboard-safe writing area (phone) ----
    // Reserve scroll room for the on-screen keyboard + format toolbar and keep the
    // caret above them, so writing at the very end of the script isn't done blind
    // behind the keyboard — see the hook for why neither half is automatic.
    useKeyboardCaretVisibility({
        container: containerEl,
        editor,
        enabled: isPhone && mobileEditMode,
    });

    // ---- Orphaned comment cleanup ----
    // Comments anchor to a node's data-id. When that node is deleted the comment
    // is orphaned (no gutter icon, unreachable), so prune it from the project.
    const pruneOrphanedComments = useCallback(() => {
        if (!editor || editor.isDestroyed || isReadOnly || !config.features.comments) return;

        const liveIds = new Set<string>();
        editor.state.doc.descendants((node) => {
            const id = node.attrs?.["data-id"];
            if (typeof id === "string") liveIds.add(id);
        });
        // Don't prune before the document has synced — an empty doc would
        // otherwise wipe every comment.
        if (liveIds.size === 0) return;

        for (const comment of commentOps.comments) {
            if (comment.nodeId && !liveIds.has(comment.nodeId)) {
                commentOps.deleteComment(comment.id);
            }
        }
    }, [editor, isReadOnly, config.features.comments, commentOps]);

    const pruneRef = useRef(pruneOrphanedComments);
    useEffect(() => {
        pruneRef.current = pruneOrphanedComments;
    }, [pruneOrphanedComments]);

    useEffect(() => {
        if (!editor || editor.isDestroyed || !config.features.comments) return;

        let debounce: ReturnType<typeof setTimeout> | null = null;
        const schedule = () => {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => pruneRef.current(), 600);
        };
        // Only prune when a transaction actually removes a node — never on typing.
        const onTransaction = ({ transaction }: { transaction: Transaction }) => {
            if (transactionDeletesNode(transaction)) schedule();
        };

        editor.on("transaction", onTransaction);
        return () => {
            editor.off("transaction", onTransaction);
            if (debounce) clearTimeout(debounce);
        };
    }, [editor, config.features.comments]);

    // ---- CSS variable application (screenplay only) ----
    useEffect(() => {
        if (!editor || editor.isDestroyed || !editor.view?.dom) return;
        if (config.type !== "screenplay") return;

        const editorElement = editor.view.dom;

        if (displaySceneNumbers) {
            editorElement.classList.remove("hide-scene-numbers");
        } else {
            editorElement.classList.add("hide-scene-numbers");
        }

        editorElement.classList.remove("scene-heading-spacing-1.5", "scene-heading-spacing-2");
        if (sceneHeadingSpacing === 1.5) {
            editorElement.classList.add("scene-heading-spacing-1.5");
        } else if (sceneHeadingSpacing === 2) {
            editorElement.classList.add("scene-heading-spacing-2");
        }

        if (sceneNumberOnRight) {
            editorElement.classList.add("scene-number-right");
        } else {
            editorElement.classList.remove("scene-number-right");
        }

        if (sceneLocking) {
            editorElement.classList.add("production-locked");
        } else {
            editorElement.classList.remove("production-locked");
        }

        if (showContdDialogue) {
            editorElement.classList.remove("hide-contd-dialogue");
        } else {
            editorElement.classList.add("hide-contd-dialogue");
        }

        editorElement.style.setProperty("--contd-label", `"${contdLabel}"`);
        editorElement.style.setProperty("--more-label", `"${moreLabel}"`);

        const elementKeys = [
            "action",
            "scene",
            "character",
            "dialogue",
            "parenthetical",
            "transition",
            "section",
        ] as const;
        for (const key of elementKeys) {
            const m = elementMargins[key] ?? DEFAULT_ELEMENT_MARGINS[key];
            // Element CSS vars = page margin + element offset (total from page edge)
            const totalLeft = pageMargins.left + (m?.left ?? 0);
            const totalRight = pageMargins.right + (m?.right ?? 0);
            editorElement.style.setProperty(`--${key}-l-margin`, `${totalLeft}in`);
            editorElement.style.setProperty(`--${key}-r-margin`, `${totalRight}in`);
            const s = { ...(DEFAULT_ELEMENT_STYLES[key] || {}), ...(elementStyles[key] || {}) };
            editorElement.style.setProperty(`--${key}-align`, s.align ?? "left");
            editorElement.style.setProperty(`--${key}-weight`, s.bold ? "bold" : "normal");
            editorElement.style.setProperty(`--${key}-style`, s.italic ? "italic" : "normal");
            editorElement.style.setProperty(`--${key}-decoration`, s.underline ? "underline" : "none");
            editorElement.style.setProperty(`--${key}-transform`, s.uppercase ? "uppercase" : "none");
        }

        // Compute startNewPage types from element styles
        const startNewPageTypes = new Set<string>();
        for (const key of elementKeys) {
            const s = { ...(DEFAULT_ELEMENT_STYLES[key] || {}), ...(elementStyles[key] || {}) };
            if (s.startNewPage) startNewPageTypes.add(key);
        }

        // Chain all pagination updates into a single transaction so options are
        // set atomically before one recomputation (avoids intermediate states
        // where some options are stale).
        const pageSize = SCREENPLAY_FORMATS[pageFormat as keyof typeof SCREENPLAY_FORMATS];
        if (pageSize) {
            editor
                .chain()
                .updateStartNewPageTypes(startNewPageTypes)
                .updateShowContdPageBreak(showContdPageBreak)
                .updatePageSize(pageSize)
                .updateMargins({
                    top: pageMargins.top * 96,
                    bottom: pageMargins.bottom * 96,
                    left: pageMargins.left * 96,
                    right: pageMargins.right * 96,
                })
                .updateHeaderContent(headerLeft, headerMiddle, headerRight)
                // Page 1 mirrors the global templates only when first-page header
                // display is on; otherwise it stays blank (unnumbered first page).
                .updateHeaderContent(
                    showFirstPageHeader ? headerLeft : "",
                    showFirstPageHeader ? headerMiddle : "",
                    showFirstPageHeader ? headerRight : "",
                    1,
                )
                .updateFooterContent(footerLeft, footerMiddle, footerRight)
                // Page 1 mirrors the global templates only when first-page footer
                // display is on; otherwise it stays blank (unnumbered first page).
                .updateFooterContent(
                    showFirstPageFooter ? footerLeft : "",
                    showFirstPageFooter ? footerMiddle : "",
                    showFirstPageFooter ? footerRight : "",
                    1,
                )
                .run();
        }

        if (isVisible) {
            editor.commands.focus();
        }
    }, [
        editor,
        isVisible,
        config.type,
        pageFormat,
        pageMargins,
        displaySceneNumbers,
        sceneHeadingSpacing,
        sceneNumberOnRight,
        contdLabel,
        moreLabel,
        showContdDialogue,
        showContdPageBreak,
        headerLeft,
        headerMiddle,
        headerRight,
        showFirstPageHeader,
        footerLeft,
        footerMiddle,
        footerRight,
        showFirstPageFooter,
        elementMargins,
        elementStyles,
        sceneLocking,
    ]);

    // ---- Pagination update (title page only) ----
    useEffect(() => {
        if (!editor || editor.isDestroyed || config.type !== "title") return;
        const pageSize = SCREENPLAY_FORMATS[pageFormat as keyof typeof SCREENPLAY_FORMATS];
        if (pageSize) {
            editor
                .chain()
                .updatePageSize(pageSize)
                .updateMargins({
                    top: pageMargins.top * 96,
                    bottom: pageMargins.bottom * 96,
                    left: pageMargins.left * 96,
                    right: pageMargins.right * 96,
                })
                .run();
        }
    }, [editor, config.type, pageFormat, pageMargins]);

    // ---- handleKeyDown (screenplay only) ----
    const selectedElementRef = useRef(selectedElement);
    const updateContextMenuRef = useRef(updateContextMenu);
    const updateSuggestionsRef = useRef(updateSuggestions);

    useEffect(() => {
        selectedElementRef.current = selectedElement;
    }, [selectedElement]);
    useEffect(() => {
        updateContextMenuRef.current = updateContextMenu;
    }, [updateContextMenu]);
    useEffect(() => {
        updateSuggestionsRef.current = updateSuggestions;
    }, [updateSuggestions]);

    const setActiveElement = useCallback(
        (element: ScreenplayElement, applyStyle = true) => {
            setSelectedElement(element);
            if (applyStyle && editor) applyElement(editor, element);
        },
        [setSelectedElement, editor],
    );

    const setActiveElementRef = useRef(setActiveElement);
    useEffect(() => {
        setActiveElementRef.current = setActiveElement;
    }, [setActiveElement]);

    useEffect(() => {
        if (!editor || config.type !== "screenplay") return;

        editor.setOptions({
            editorProps: {
                // Re-apply the base contenteditable attributes: setOptions replaces
                // editorProps wholesale, so without this the text-input traits set at
                // mount (autocorrect, spellcheck) would be dropped for screenplay editors.
                attributes: EDITOR_INPUT_ATTRIBUTES,
                handleKeyDown(view: EditorView, event: KeyboardEvent) {
                    const selection = view.state.selection;
                    const node = selection.$anchor.parent;
                    const nodeSize = node.content.size;
                    const nodePos = selection.$head.parentOffset;
                    const currNode = node.attrs.class as ScreenplayElement;

                    if (event.key === "Backspace") {
                        // Inside a dual_dialogue_column: let the column node handle it.
                        for (let d = selection.$anchor.depth; d >= 1; d--) {
                            if (selection.$anchor.node(d).type.name === DUAL_DIALOGUE_COLUMN) return false;
                        }
                        if (nodeSize === 1 && nodePos === 1) {
                            const tr = view.state.tr.delete(selection.from - 1, selection.from);
                            view.dispatch(tr);
                            return true;
                        }
                        return false;
                    }

                    if (event.code === "Space") {
                        if (currNode === ScreenplayElement.Action && node.textContent.match(/^\b(int|ext)\./gi)) {
                            setActiveElementRef.current(ScreenplayElement.Scene);
                        }
                        return false;
                    }

                    if (event.key === "Enter") {
                        // Kept fresh by re-registering on `suggestions.length`
                        // (see this effect's deps), not by a ref.
                        if (suggestions.length > 0) {
                            event.preventDefault();
                            return true;
                        }

                        // Inside a dual_dialogue_column: let the column node's
                        // addKeyboardShortcuts handle Enter instead of this handler.
                        const $anchor = selection.$anchor;
                        for (let d = $anchor.depth; d >= 1; d--) {
                            if ($anchor.node(d).type.name === DUAL_DIALOGUE_COLUMN) return false;
                        }

                        if (currNode === ScreenplayElement.Dialogue && nodePos > 0 && nodePos < nodeSize) {
                            const doc = view.state.doc;
                            const $anchor = selection.$anchor;

                            // Find the nearest preceding Character node
                            let charName = "";
                            for (let i = $anchor.index(0) - 1; i >= 0; i--) {
                                const child = doc.child(i);
                                if (child.attrs.class === ScreenplayElement.Character) {
                                    charName = child.textContent;
                                    break;
                                }
                                if (
                                    child.attrs.class !== ScreenplayElement.Parenthetical &&
                                    child.attrs.class !== ScreenplayElement.Dialogue
                                )
                                    break;
                            }

                            const schema = view.state.schema;
                            const secondHalf = node.content.cut(nodePos);

                            const charNode = schema.nodes[ScreenplayElement.Character].create(
                                { class: ScreenplayElement.Character, height: null },
                                charName ? schema.text(charName) : undefined,
                            );
                            const newDialogue = schema.nodes[ScreenplayElement.Dialogue].create(
                                { class: ScreenplayElement.Dialogue, height: null },
                                secondHalf.size > 0 ? secondHalf : undefined,
                            );

                            const tr = view.state.tr;
                            tr.delete($anchor.pos, $anchor.end(1));
                            const insertPos = tr.mapping.map($anchor.after(1));
                            tr.insert(insertPos, [charNode, newDialogue]);
                            tr.setSelection(TextSelection.create(tr.doc, insertPos + charNode.nodeSize + 1));
                            tr.scrollIntoView();
                            view.dispatch(tr);
                            return true;
                        }

                        if (nodePos < nodeSize) return false;

                        let newNode = ScreenplayElement.Action;
                        if (nodePos !== 0) {
                            switch (currNode) {
                                case ScreenplayElement.Character:
                                case ScreenplayElement.Parenthetical:
                                    newNode = ScreenplayElement.Dialogue;
                            }
                        }
                        insertElement(editor, newNode, selection.$anchor.after());
                        return true;
                    }

                    return false;
                },
            },
        });
    }, [editor, config.type, suggestions.length]);

    // Global-scope shortcuts are registered once, by ProjectWorkspace: they act
    // on the project and the workspace rather than on this document, and one
    // window listener per mounted panel meant whichever panels happened to be up
    // each answering the same keystroke.

    // ---- Tab / Escape keyboard listener (screenplay only) ----
    useEffect(() => {
        if (!isVisible || config.type !== "screenplay") return;

        const pressedKeyEvent = (e: KeyboardEvent) => {
            if (!editor?.isFocused) return;
            if (e.key === "Tab") {
                e.preventDefault();
                switch (selectedElementRef.current) {
                    case ScreenplayElement.Action:
                        setActiveElementRef.current(ScreenplayElement.Character);
                        break;
                    case ScreenplayElement.Parenthetical:
                        setActiveElementRef.current(ScreenplayElement.Dialogue);
                        break;
                    case ScreenplayElement.Character:
                        setActiveElementRef.current(ScreenplayElement.Action);
                        break;
                    case ScreenplayElement.Dialogue:
                        setActiveElementRef.current(ScreenplayElement.Parenthetical);
                        break;
                }
            }

            if (e.ctrlKey && e.key === "s") {
                e.preventDefault();
            }

            if (e.key === "Escape") {
                updateContextMenuRef.current(undefined);
                updateSuggestionsRef.current?.([]);
            }
        };

        addEventListener("keydown", pressedKeyEvent);
        return () => removeEventListener("keydown", pressedKeyEvent);
    }, [isVisible, config.type, editor]);

    // Create a new empty comment anchored to a node and open its thread.
    const addCommentToNode = useCallback(
        (nodeId: string) => {
            commentOps.addComment({
                nodeId,
                text: "",
                author: user?.username || "Anonymous",
                createdAt: Date.now(),
                resolved: false,
                replies: [],
            });
            commentOps.setActiveNodeId(nodeId);
        },
        [commentOps, user],
    );

    // Publish it for MobileFormatToolbar, which offers the same action from the
    // keyboard bar but lives outside this panel (see comment-actions).
    useEffect(() => {
        if (!editor || !config.features.comments) return;
        registerAddComment(editor, addCommentToNode);
        return () => unregisterAddComment(editor);
    }, [editor, config.features.comments, addCommentToNode]);

    // ---- Context menu ----
    const onEditorContextMenu = useCallback(
        (e: React.MouseEvent) => {
            if (!editor) return;
            // .page_shift spans the full editor column, but the page (editor.view.dom)
            // is narrower and centred — ignore right-clicks in the surrounding gutter.
            if (!editor.view.dom.contains(e.target as Node)) return;

            e.preventDefault();

            const { from, to } = editor.state.selection;

            // Check for spellcheck error under cursor. Resolve the FULL word from
            // the plugin's decoration set by document position — not from the DOM
            // element's text — because a revision mark (or any inline mark) over
            // part of the word splits the single error decoration into several
            // `.spellcheck-error` spans, and `closest(...).textContent` would
            // capture only the clicked fragment (e.g. "This" of "Thissss").
            const target = e.target as HTMLElement;
            const spellErrorEl = target.closest(".spellcheck-error") as HTMLElement | null;
            let spellError: { word: string; from: number; to: number } | undefined;
            if (spellErrorEl) {
                const coordPos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos;
                const pos = coordPos ?? editor.view.posAtDOM(spellErrorEl, 0);
                spellError = getSpellErrorAt(editor.state, pos) ?? undefined;
            }

            // Detect shelvable node at caret position
            let nodePos: number | undefined;
            let nodeClass: string | undefined;
            if (config.features.shelving) {
                const $pos = editor.state.doc.resolve(from);
                if ($pos.depth >= 1) {
                    const cls = $pos.node(1).attrs.class as ScreenplayElement;
                    if (
                        cls === ScreenplayElement.Scene ||
                        cls === ScreenplayElement.Character ||
                        cls === ScreenplayElement.Action
                    ) {
                        nodePos = from;
                        nodeClass = cls;
                    }
                }
            }

            // Detect a scene heading at the caret to offer "Send to timeline".
            // Independent of `shelving` so it works in editor documents too.
            let outlineScene: { refDocId: string; refId: string; title: string } | undefined;
            if (config.documentId) {
                const $pos = editor.state.doc.resolve(from);
                if ($pos.depth >= 1) {
                    const node = $pos.node(1);
                    const dataId = node.attrs?.["data-id"] as string | undefined;
                    if (node.attrs?.class === ScreenplayElement.Scene && dataId) {
                        outlineScene = {
                            refDocId: config.documentId,
                            refId: dataId,
                            title: node.textContent.toUpperCase(),
                        };
                    }
                }
            }

            // Manual page break: the top-level block under the caret, plus whether
            // it already forces a page break. Paginated screenplay editors only, and
            // never the document's first block (there is nothing to break before it).
            let pageBreak: { pos: number; active: boolean } | undefined;
            if (config.features.paginationMode === "screenplay") {
                const $pos = editor.state.doc.resolve(from);
                if ($pos.depth >= 1) {
                    const nodeStart = $pos.before(1);
                    if (nodeStart > 0) {
                        pageBreak = { pos: nodeStart, active: !!$pos.node(1).attrs.pageBreak };
                    }
                }
            }

            // Comments anchor to the node under the caret, not a text range.
            const commentNodeId = getNodeIdAtPos(editor.state, from);
            const onAddComment = commentNodeId ? () => addCommentToNode(commentNodeId) : undefined;

            updateContextMenu({
                type: ContextMenuType.EditorContextMenu,
                position: { x: e.clientX, y: e.clientY },
                // Pass the editor that was right-clicked: positions above are
                // resolved against it, and ProjectContext.editor is always the
                // MAIN screenplay editor — so secondary editors (tree document,
                // draft, title page) must act on this instance, not that one.
                typeSpecificProps: {
                    editor,
                    from,
                    to,
                    onAddComment,
                    spellError,
                    nodePos,
                    nodeClass,
                    outlineScene,
                    pageBreak,
                },
            });
        },
        [
            editor,
            updateContextMenu,
            addCommentToNode,
            config.features.shelving,
            config.features.paginationMode,
            config.documentId,
        ],
    );

    // Clear the open discussion when clicking elsewhere in the editor.
    const handleContainerMouseDown = useCallback(() => {
        commentOps.setActiveNodeId(null);
    }, [commentOps]);

    // Fixed handle height and inset of the track from the panel's top/bottom.
    // (Keep HANDLE_HEIGHT in sync with .scroll_handle's height, and the insets
    // in sync with .scroll_track's top/bottom, in the CSS.) The top inset clears
    // the right sidebar edge toggle so the handle can't overlap it, and the
    // bottom inset keeps it off the very bottom of the screen.
    const HANDLE_HEIGHT = 44;
    const TRACK_INSET_TOP = 60;
    // Base bottom gap only; the CSS adds --safe-bottom on top, which can't be read
    // here. This is just the first-frame travel-range fallback before the track
    // element mounts and is measured directly, so the missing inset is harmless.
    const TRACK_INSET_BOTTOM = 8;

    // How far the handle can travel down its track. Measured off the track element
    // itself, which is fixed to the viewport (see .scroll_track) so the range stays
    // constant regardless of the mobile navbar's collapse — driving it off the
    // container's clientHeight instead would make the handle jump as the navbar
    // hides and the container grows. Falls back to the container-derived estimate
    // for the first frame before the track has mounted.
    const thumbTravel = useCallback(() => {
        const track = scrollTrackRef.current;
        const trackHeight = track
            ? track.clientHeight
            : (containerEl?.clientHeight ?? 0) - TRACK_INSET_TOP - TRACK_INSET_BOTTOM;
        return Math.max(0, trackHeight - HANDLE_HEIGHT);
    }, [containerEl]);

    // Recompute the handle's position from the container's scroll metrics: it's a
    // fixed-size grab handle whose offset mirrors how far down we're scrolled.
    const updateThumb = useCallback(() => {
        const el = containerEl;
        if (!el) return;
        const { scrollTop, scrollHeight, clientHeight } = el;
        const scrollable = scrollHeight - clientHeight;
        if (scrollable <= 0) {
            setCanScrollThumb(false);
            return;
        }
        setCanScrollThumb(true);
        const top = (scrollTop / scrollable) * thumbTravel();
        thumbTopRef.current = top;
        const handle = scrollHandleRef.current;
        if (handle) handle.style.transform = `translateY(${top}px)`;
    }, [containerEl, thumbTravel]);

    // Reveal the thumb and (re)arm the timer that hides it once scrolling has
    // been idle for a beat. While dragging, keep it pinned open (no auto-hide).
    const revealScrollThumb = useCallback(() => {
        setShowScrollThumb(true);
        if (scrollIdleTimer.current) clearTimeout(scrollIdleTimer.current);
        if (!isDraggingThumb.current) {
            scrollIdleTimer.current = setTimeout(() => setShowScrollThumb(false), 1200);
        }
    }, []);

    const chromeHide = useChromeHide({
        enabled: isPhone,
        pinned: mobileEditMode,
        editor,
        setChromeHidden,
    });

    // Phone reader taps. The reader is not editable, so taps don't place a caret
    // and are free to drive chrome: a single tap brings back the chrome the user
    // scrolled away; a double tap enters edit mode and focuses the editor, bringing
    // up the keyboard. Off phone, in edit mode, or for read-only viewers this is
    // inert so normal caret/selection behaviour is untouched.
    const handleReaderTap = useCallback(
        (e: React.MouseEvent) => {
            if (!isPhone || mobileEditMode) return;

            if (tapTimer.current) {
                // Second tap inside the window → double tap: enter edit mode.
                clearTimeout(tapTimer.current);
                tapTimer.current = null;
                if (isReadOnly) return;
                setMobileEditMode(true);
                // Make the editor editable and focus it SYNCHRONOUSLY inside this
                // tap gesture. iOS only raises the on-screen keyboard when focus()
                // runs in the same user-gesture turn — deferring it (setTimeout)
                // breaks that chain and the keyboard stays down. The mobileEditMode
                // effect also flips setEditable(true), so this just gets there a
                // tick earlier.
                const ed = editor;
                if (ed) {
                    ed.setEditable(true);
                    // Drop the caret exactly where the user double-tapped, so the
                    // caret lands under their finger (like a native tap-to-edit).
                    // The pen button, which has no tap point, aims at the viewport
                    // instead (see focusEditorInViewport / ProjectWorkspace).
                    focusEditorAtCoords(ed, e.clientX, e.clientY);
                    // Then scroll the tapped line to the middle of what's still
                    // visible with the keyboard up — a tap low on the screen would
                    // otherwise leave the caret hidden behind it.
                    centerCaretInView(ed);
                }
                return;
            }

            // First tap: wait briefly to see if a second one follows. If not,
            // treat it as a single tap and reveal the chrome (a no-op when already
            // shown).
            tapTimer.current = setTimeout(() => {
                tapTimer.current = null;
                chromeHide.reveal();
            }, 280);
        },
        [isPhone, mobileEditMode, isReadOnly, editor, setMobileEditMode, chromeHide],
    );

    const onScroll = () => {
        if (suggestions.length > 0) updateSuggestions?.([]);
        // Coalesce into one update per frame. iOS delivers scroll events on the
        // main thread at an irregular cadence while the page scrolls on the
        // compositor; doing the work per event (each a layout, plus a re-render)
        // let the chrome drift behind the finger and stutter. Draining the latest
        // scrollTop once per rAF keeps a single, paint-aligned update.
        if (scrollRafRef.current != null) return;
        scrollRafRef.current = requestAnimationFrame(() => {
            scrollRafRef.current = null;
            const el = containerEl;
            if (!el) return;
            // Clamp to the real scroll range. iOS rubber-band overscroll reports a
            // scrollTop below 0 (top) or beyond the maximum (bottom) and then
            // springs back, which would otherwise feed spurious up/down deltas
            // into the chrome hide and make the navbar flicker as the bounce
            // settles. Clamping pins the delta to 0 while overscrolling, so the
            // bounce leaves the bar alone.
            const maxScroll = el.scrollHeight - el.clientHeight;
            const scrollTop = Math.max(0, Math.min(el.scrollTop, maxScroll));
            setIsScrolled(scrollTop > 0);
            chromeHide.onScrollTick(scrollTop);
            if (!isPhone) return;
            updateThumb();
            revealScrollThumb();
        });
    };

    // Drag the thumb to scroll: map vertical pointer movement onto scrollTop via
    // the same track/scrollable ratio used to size the thumb.
    const onThumbPointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            const el = containerEl;
            if (!el) return;
            e.preventDefault();
            e.stopPropagation();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            isDraggingThumb.current = true;
            // Dragging the handle is a deliberate user scroll, so let it hide the
            // chrome just like a finger swipe.
            chromeHide.beginUserScroll();
            revealScrollThumb();

            const startY = e.clientY;
            const startScrollTop = el.scrollTop;
            const scrollable = el.scrollHeight - el.clientHeight;
            const maxThumbTravel = thumbTravel();

            const onMove = (ev: PointerEvent) => {
                if (maxThumbTravel <= 0) return;
                const delta = ev.clientY - startY;
                const ratio = (delta / maxThumbTravel) * scrollable;
                el.scrollTop = Math.max(0, Math.min(scrollable, startScrollTop + ratio));
            };
            const onUp = () => {
                isDraggingThumb.current = false;
                chromeHide.endUserScroll();
                revealScrollThumb(); // re-arm the auto-hide now that the drag is done
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                window.removeEventListener("pointercancel", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
            window.addEventListener("pointercancel", onUp);
        },
        [containerEl, revealScrollThumb, thumbTravel, chromeHide],
    );

    // Timers and frames owned by this panel (the chrome-hide ones clean themselves
    // up — see useChromeHide).
    useEffect(() => {
        return () => {
            if (scrollIdleTimer.current) clearTimeout(scrollIdleTimer.current);
            if (tapTimer.current) clearTimeout(tapTimer.current);
            if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
        };
    }, []);

    const focusType = focusedTypeOverride ?? (config.type === "screenplay" ? "screenplay" : "title");

    const wrapperStyle = pageSize
        ? ({
              "--page-width": `${pageSize.pageWidth}px`,
              "--page-height": `${pageSize.pageHeight}px`,
              // The writer's zoom. Multiplied with --editor-fit in CSS rather than
              // here, because the fit half is measured and lives on the container.
              "--editor-user-zoom": `${userZoom}`,
          } as React.CSSProperties)
        : undefined;

    const t = useTranslations("navbar");
    const isLocalAccess = isTauri() || isLocalOnly;
    if (!isLocalAccess && (!membership || isLoading)) return <Loading />;

    return (
        <div
            className={join(
                styles.editor_panel,
                isEditorReady ? styles.visible : styles.hidden,
                isVisible ? "" : styles.parked,
            )}
        >
            <div
                ref={setContainerEl}
                className={join(
                    styles.container,
                    timelineOpen ? styles.timeline_open : "",
                    // Zoomed past 1:1 the page is wider than the column that holds
                    // it, so the container has to allow panning to it — its default
                    // `overflow-x: clip` would simply cut the right margin off.
                    userZoom > 1 ? styles.zoom_pan : "",
                )}
                onScroll={onScroll}
                onTouchStart={chromeHide.beginUserScroll}
                onTouchEnd={chromeHide.endUserScroll}
                onTouchCancel={chromeHide.endUserScroll}
                onClick={handleReaderTap}
                onMouseDown={handleContainerMouseDown}
                onFocus={() => setFocusedEditorType(focusType)}
                onPasteCapture={
                    isReadOnly
                        ? (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                          }
                        : undefined
                }
            >
                <div
                    className={join(
                        styles.editor_wrapper,
                        isEndlessScroll ? styles.endless_scroll : "",
                        zoomActive ? styles.zoomed : "",
                    )}
                    style={wrapperStyle}
                >
                    <div className={join(styles.editor_shadow, isScrolled ? styles.show_shadow : "")} />
                    {isReadOnly && (
                        <div className={styles.viewOnlyBannerWrapper}>
                            <div className={styles.viewOnlyBanner} title={t("viewOnlyHint")}>
                                <Eye size={14} />
                                <span>{t("viewOnly")}</span>
                            </div>
                        </div>
                    )}
                    <div className={styles.page_shift} onContextMenu={onEditorContextMenu}>
                        <EditorContent editor={editor} spellCheck={false} />
                    </div>
                </div>
                {config.features.comments && (
                    <CommentGutter
                        editor={editor}
                        comments={commentOps.comments}
                        activeNodeId={commentOps.activeNodeId}
                        setActiveNodeId={commentOps.setActiveNodeId}
                        onAddComment={addCommentToNode}
                        onUpdateComment={(id, data) => commentOps.updateComment(id, data)}
                        onDeleteComment={(id) => commentOps.deleteComment(id)}
                        onResolveComment={(id) => commentOps.resolveComment(id)}
                        onAddReply={(commentId, text, author) =>
                            commentOps.addReply(commentId, { text, author, createdAt: Date.now() })
                        }
                    />
                )}
            </div>
            {isPhone && canScrollThumb && (
                <div
                    ref={scrollTrackRef}
                    className={join(styles.scroll_track, showScrollThumb ? styles.scroll_track_visible : "")}
                >
                    <div
                        ref={scrollHandleRef}
                        className={styles.scroll_handle}
                        style={{ transform: `translateY(${thumbTopRef.current}px)` }}
                        onPointerDown={onThumbPointerDown}
                    >
                        <GripVertical size={16} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default DocumentEditorPanel;
