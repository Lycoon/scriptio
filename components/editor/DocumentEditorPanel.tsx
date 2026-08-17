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
import { useGlobalKeybinds, useIsPhone, useProjectMembership, useSettings } from "@src/lib/utils/hooks";
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
    globalContext?: { toggleFocusMode: () => void; saveProject: () => void };
    /** Override the focus type reported to ProjectContext on focus. */
    focusedTypeOverride?: "screenplay" | "title" | "draft";
}

// Scroll distance (px) that fully hides the mobile chrome. Deliberately several
// times the navbar height so the bar eases away gradually over a longer swipe
// rather than snapping shut after a flick — matches the pace of a natural scroll.
const CHROME_HIDE_RANGE = 220;

// How far through that range the swipe got, measured only once it is over, decides
// which way the chrome resolves: past this it finishes hiding, below it it comes
// back. The chrome therefore only ever *rests* fully shown or fully hidden, never
// stranded half-way up and half faded — Google Docs' toolbar settles the same way.
// Deliberately not applied mid-gesture: while the finger is down (or its momentum
// still running) the chrome tracks the scroll 1:1 and nothing snaps under it.
const CHROME_SNAP_THRESHOLD = 0.5;
// Duration (ms) of that run-out. Short enough to read as the tail of the swipe
// rather than a separate animation playing after it.
const CHROME_SNAP_MS = 180;

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
    globalContext,
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
    // Last scrollTop, to derive scroll direction for hiding/showing the mobile
    // editor chrome (navbar + sidebar edge handles).
    const lastScrollTop = useRef(0);
    // Whether the scroll in flight was started by the user's finger (a touch on
    // the reader, or a drag of the scroll handle), as opposed to a programmatic
    // scroll — e.g. "Go to scene" from the sidebar, which calls scrollIntoView.
    // Only finger-driven scrolls hide the mobile chrome: a programmatic jump
    // must not slide the navbar (and the open sidebar's dimming backdrop) away
    // under the user, which reads as an unnatural, un-dimmed flash. Kept alive
    // through iOS momentum by an idle timer (see armUserScrollIdle) so a real
    // flick still hides the chrome after the finger has lifted.
    const isUserScrolling = useRef(false);
    // True while a finger (or the handle drag) is actually down, so the idle
    // timer never clears mid-drag when the user holds still for a beat.
    const isFingerDown = useRef(false);
    const userScrollIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Coalesces all scroll-driven work into a single update per animation frame
    // (see onScroll). A burst of scroll events then costs one layout, aligned to
    // the paint cycle, so the chrome stays glued to the scroll instead of lagging.
    const scrollRafRef = useRef<number | null>(null);
    // Continuous 0→1 progress for hiding that chrome, tracked so it follows the
    // scroll gesture rather than jumping between shown and hidden (see
    // applyChromeHide). Mirrored into the --chrome-hide CSS variable.
    const chromeHideRef = useRef(0);
    // Handle of the in-flight snap animation that runs the chrome out to a resting
    // state once the gesture is released (see snapChromeHide). Non-null means a
    // snap owns --chrome-hide right now, so scroll deltas leave it alone.
    const chromeSnapRafRef = useRef<number | null>(null);
    // Pending single-tap timer for the phone reader. A tap arms it; a second tap
    // within the window cancels it and counts as a double tap (see handleReaderTap).
    const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Callback ref stored in state so the effects below re-run when the scroll
    // container actually mounts (it may render after a Loading fallback).
    const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);

    // Resolve the comments Y.Map for this document
    const projectState = repository?.getState();
    const commentsMap = useMemo(
        () => (projectState && config.features.comments ? config.getCommentsMap(projectState) : null),
        // Re-derive only when projectState identity changes (Yjs doc swap on project change)
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [projectState],
    );

    // Per-document comment state
    const commentOps = useDocumentComments(commentsMap, repository);

    // Build the editor
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
        globalContext,
        setSelectedTitlePageElement,
    });

    // Register the editor instance with the parent wrapper
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

    // Marker class on the editor DOM so global CSS (scriptio.css) can drop the
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

    // Ready state
    useEffect(() => {
        if (editor && isYjsReady) {
            const timer = setTimeout(() => setIsEditorReady(true), 500);
            return () => clearTimeout(timer);
        }
    }, [editor, isYjsReady]);

    // ---- Phone view modes ----
    // Endless (default on phone): the CSS reflows text into the viewport at full
    // size via a compact --display-margin-scale — no page rectangles, so nothing
    // shifts while writing. Paged (endless off): render the real fixed-size page —
    // page breaks, headers, footers, exactly like desktop — and scale the whole
    // page down with transform: scale() so it fits the viewport width. A fixed
    // page rectangle means its boundaries never move as you type, so there are no
    // layout shifts. The scale is purely visual (NOT `zoom`: WebKit clamps
    // zoom-shrunk fonts to a 9px rendered minimum, inflating the screenplay font
    // — see the paged-mode rule in EditorPanel.module.css) and pagination is
    // measured off-screen, so page count / numbering are unaffected either way.
    // Layout effect so the paged scale is in place before the browser paints the
    // new mode — and before the scroll re-anchoring below measures it.
    useIsoLayoutEffect(() => {
        const container = containerEl;
        if (!container) return;

        const pageSize = SCREENPLAY_FORMATS[pageFormat as keyof typeof SCREENPLAY_FORMATS];
        // Only the phone paged view is scaled. Endless reflows (no scale); desktop
        // shows the page at 1:1.
        if (!isPhone || isEndlessScroll || !pageSize) {
            container.style.removeProperty("--editor-zoom");
            container.style.removeProperty("--editor-layout-height");
            return;
        }

        const apply = () => {
            const avail = container.clientWidth;
            if (!avail) return;
            // Fit the full canonical page width into the viewport; never upscale.
            // Leaves a small gutter so the page edges aren't flush with the screen.
            const ratio = Math.min(1, (avail - 8) / pageSize.pageWidth);
            container.style.setProperty("--editor-zoom", `${ratio}`);
        };

        apply();
        const ro = new ResizeObserver(apply);
        ro.observe(container);

        // transform: scale() doesn't shrink the layout box the way `zoom` did, so
        // the CSS collapses the leftover (1 − scale) tail of the editor's layout
        // height with a negative margin. Track the untransformed height here
        // (offsetHeight ignores transforms) and expose it as a CSS var.
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
            ro.disconnect();
            heightObserver?.disconnect();
            container.style.removeProperty("--editor-layout-height");
        };
    }, [containerEl, isPhone, isEndlessScroll, pageFormat, editor]);

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
                        // suggestions.length check: read from ref to avoid stale closure
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

    // ---- Global keybinds (screenplay only) ----
    const globalActions = useMemo(
        () => globalContext ?? { toggleFocusMode: () => {}, saveProject: () => {} },
        [globalContext],
    );
    useGlobalKeybinds(config.type === "screenplay" ? keybinds : undefined, globalActions);

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

    // Drive the mobile chrome hide (navbar + sidebar edge handles + pen button)
    // as a continuous 0→1 progress written straight to a CSS variable, so it
    // tracks the scroll gesture rather than flipping between two states. The
    // gesture drives it the whole way; only once the gesture is over does
    // snapChromeHide run whatever travel is left, so the chrome never comes to
    // *rest* half-way. Written imperatively (no React state) to keep it
    // frame-tight. `chromeHidden` is kept in sync only as a coarse flag for logic
    // that needs a discrete "mostly hidden" state.
    const applyChromeHide = useCallback(
        (progress: number) => {
            const clamped = progress < 0 ? 0 : progress > 1 ? 1 : progress;
            if (clamped === chromeHideRef.current) return;
            const wasHidden = chromeHideRef.current > 0.5;
            chromeHideRef.current = clamped;
            document.documentElement.style.setProperty("--chrome-hide", clamped.toFixed(4));
            const isHidden = clamped > 0.5;
            if (isHidden !== wasHidden) setChromeHidden(isHidden);
        },
        [setChromeHidden],
    );

    const cancelChromeSnap = useCallback(() => {
        if (chromeSnapRafRef.current == null) return;
        cancelAnimationFrame(chromeSnapRafRef.current);
        chromeSnapRafRef.current = null;
    }, []);

    /**
     * Ease the chrome to a resting state — fully shown (0) or fully hidden (1) —
     * rather than leaving it stranded wherever the finger stopped. Only ever
     * called once the gesture (and its momentum) is over; nothing snaps while the
     * user is still scrolling.
     *
     * Driven by rAF and not a CSS transition, because --chrome-hide is also what
     * the gesture writes and the CSS deliberately carries no transition on it so
     * it can track the finger 1:1; a transition would smear every scroll frame
     * instead. While this runs it owns the variable, and a new touch cancels it
     * (see onReaderTouchStart) so the next gesture takes over mid-flight.
     */
    const snapChromeHide = useCallback(
        (target: 0 | 1) => {
            cancelChromeSnap();
            const from = chromeHideRef.current;
            if (from === target) return;
            const startedAt = performance.now();
            const step = (now: number) => {
                const t = Math.min(1, (now - startedAt) / CHROME_SNAP_MS);
                // easeOutCubic: leaves fast so it reads as a continuation of the
                // swipe's momentum, then settles gently.
                const eased = 1 - (1 - t) ** 3;
                applyChromeHide(from + (target - from) * eased);
                chromeSnapRafRef.current = t < 1 ? requestAnimationFrame(step) : null;
            };
            chromeSnapRafRef.current = requestAnimationFrame(step);
        },
        [applyChromeHide, cancelChromeSnap],
    );

    // Reset the chrome to fully shown whenever it can't/shouldn't be hidden:
    // leaving phone layout, entering edit mode, or on unmount (so the next screen
    // doesn't inherit a half-hidden bar).
    useEffect(() => {
        if (!isPhone || mobileEditMode) {
            cancelChromeSnap();
            applyChromeHide(0);
        }
        return () => {
            cancelChromeSnap();
            applyChromeHide(0);
        };
    }, [isPhone, mobileEditMode, applyChromeHide, cancelChromeSnap]);

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
                cancelChromeSnap();
                applyChromeHide(0);
            }, 280);
        },
        [isPhone, mobileEditMode, isReadOnly, editor, setMobileEditMode, applyChromeHide, cancelChromeSnap],
    );

    // Clear the finger-driven flag once scrolling has settled. Called after the
    // finger lifts; iOS momentum keeps firing scroll events that push this out
    // (see onScroll), so it only fires once the fling has actually stopped.
    const armUserScrollIdle = useCallback(() => {
        if (userScrollIdleTimer.current) clearTimeout(userScrollIdleTimer.current);
        userScrollIdleTimer.current = setTimeout(() => {
            isUserScrolling.current = false;
            // The gesture is genuinely over now — finger up and the momentum it
            // threw has settled — so this is the one moment the chrome is allowed
            // to resolve. Run it out to whichever end the swipe got closest to,
            // rather than leaving the bar parked half off-screen and half faded.
            const progress = chromeHideRef.current;
            if (chromeSnapRafRef.current == null && progress > 0 && progress < 1) {
                snapChromeHide(progress >= CHROME_SNAP_THRESHOLD ? 1 : 0);
            }
        }, 200);
    }, [snapChromeHide]);

    // Finger touches the reader: from here until the touch ends (plus any
    // momentum) scrolls count as user-driven and may hide the chrome. Drop any
    // run-out still playing from the previous gesture so this one picks the chrome
    // up from wherever it got to, rather than being locked out until it lands.
    const onReaderTouchStart = useCallback(() => {
        cancelChromeSnap();
        isFingerDown.current = true;
        isUserScrolling.current = true;
        if (userScrollIdleTimer.current) clearTimeout(userScrollIdleTimer.current);
    }, [cancelChromeSnap]);

    // Finger lifts (or the touch is cancelled): let momentum keep the flag alive,
    // then clear it once scrolling settles.
    const onReaderTouchEnd = useCallback(() => {
        isFingerDown.current = false;
        armUserScrollIdle();
    }, [armUserScrollIdle]);

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
            if (!isPhone) return;
            updateThumb();
            revealScrollThumb();

            // Keep the finger-driven flag alive through iOS momentum: once the
            // finger is up, each remaining scroll event pushes the idle-clear
            // out, so it only lands when the fling settles.
            if (isUserScrolling.current && !isFingerDown.current) armUserScrollIdle();

            // Accumulate scroll movement into the hide progress over
            // CHROME_HIDE_RANGE px: scrolling down slides the chrome away,
            // scrolling up brings it back (from anywhere in the doc). Snap fully
            // open at the very top. In edit mode the navbar carries the
            // exit/undo/redo controls, so keep it pinned open. Only a
            // finger-driven scroll moves the chrome — a programmatic scroll (e.g.
            // "Go to scene") leaves isUserScrolling false, so the chrome and the
            // sidebar's backdrop stay put under the jump.
            const delta = scrollTop - lastScrollTop.current;
            if (mobileEditMode || scrollTop <= 4) {
                cancelChromeSnap();
                applyChromeHide(0);
            } else if (isUserScrolling.current && chromeSnapRafRef.current == null) {
                // Pure 1:1 tracking — the threshold is only consulted once the
                // gesture is over (see armUserScrollIdle), so the bar never snaps
                // out from under a finger that is still on the screen. Skipped
                // while a run-out is in flight, so a stray scroll event can't
                // fight it; a real new gesture cancels it on touch-down instead.
                applyChromeHide(chromeHideRef.current + delta / CHROME_HIDE_RANGE);
            }
            lastScrollTop.current = scrollTop;
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
            // chrome just like a finger swipe (kept true until the drag ends), and
            // take the chrome back from any run-out still playing.
            cancelChromeSnap();
            isFingerDown.current = true;
            isUserScrolling.current = true;
            if (userScrollIdleTimer.current) clearTimeout(userScrollIdleTimer.current);
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
                isFingerDown.current = false;
                armUserScrollIdle(); // let the flag clear once the scroll settles
                revealScrollThumb(); // re-arm the auto-hide now that the drag is done
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                window.removeEventListener("pointercancel", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
            window.addEventListener("pointercancel", onUp);
        },
        [containerEl, revealScrollThumb, thumbTravel, armUserScrollIdle, cancelChromeSnap],
    );

    // Clean up the idle timer on unmount.
    useEffect(() => {
        return () => {
            if (scrollIdleTimer.current) clearTimeout(scrollIdleTimer.current);
            if (tapTimer.current) clearTimeout(tapTimer.current);
            if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
            if (chromeSnapRafRef.current != null) cancelAnimationFrame(chromeSnapRafRef.current);
            if (userScrollIdleTimer.current) clearTimeout(userScrollIdleTimer.current);
        };
    }, []);

    // Reveal the chrome again the moment the user starts writing. The native
    // `input` event on the contenteditable fires only for real user edits — not
    // for programmatic/collaboration changes or the pagination height updates —
    // so it won't fight the scroll-hide. Off phone this is a no-op.
    useEffect(() => {
        if (!isPhone) return;
        const dom = editor?.view?.dom;
        if (!dom) return;
        const onInput = () => {
            cancelChromeSnap();
            applyChromeHide(0);
        };
        dom.addEventListener("input", onInput);
        return () => dom.removeEventListener("input", onInput);
    }, [editor, isPhone, applyChromeHide, cancelChromeSnap]);

    const focusType = focusedTypeOverride ?? (config.type === "screenplay" ? "screenplay" : "title");

    const pageSize = SCREENPLAY_FORMATS[pageFormat as keyof typeof SCREENPLAY_FORMATS];
    const wrapperStyle = pageSize
        ? ({
              "--page-width": `${pageSize.pageWidth}px`,
              "--page-height": `${pageSize.pageHeight}px`,
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
                className={join(styles.container, timelineOpen ? styles.timeline_open : "")}
                onScroll={onScroll}
                onTouchStart={onReaderTouchStart}
                onTouchEnd={onReaderTouchEnd}
                onTouchCancel={onReaderTouchEnd}
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
                    className={`${styles.editor_wrapper} ${isEndlessScroll ? styles.endless_scroll : ""}`}
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
