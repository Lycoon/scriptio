"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
import { DocumentEditorConfig } from "@src/lib/editor/document-editor-config";
import { useDocumentComments } from "@src/lib/editor/use-document-comments";
import { getNodeIdAtPos, transactionDeletesNode } from "@src/lib/screenplay/comment-anchors";
import { useDocumentEditor } from "@src/lib/editor/use-document-editor";
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
    const { isEndlessScroll, setChromeHidden } = useViewContext();
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
    const [thumbTop, setThumbTop] = useState(0);
    const [canScrollThumb, setCanScrollThumb] = useState(false);
    const scrollIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isDraggingThumb = useRef(false);
    // Last scrollTop, to derive scroll direction for hiding/showing the mobile
    // editor chrome (navbar + sidebar edge handles).
    const lastScrollTop = useRef(0);
    // Callback ref stored in state so the zoom effect re-runs when the scroll
    // container actually mounts (it may render after a Loading fallback).
    const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);

    // Resolve the comments Y.Map for this document
    const projectState = repository?.getState();
    const commentsMap = useMemo(
        () =>
            projectState && config.features.comments ? config.getCommentsMap(projectState) : null,
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

    // Read-only enforcement for VIEWER role.
    //
    // The server already drops doc writes from viewers (see protocol.ts), but
    // disabling tiptap locally avoids a confusing "I typed but nothing
    // happened" experience: keystrokes are blocked at the editor level and
    // collaboration carets/awareness still render normally.
    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        editor.setEditable(!isReadOnly);
    }, [editor, isReadOnly]);

    // Marker class on the editor DOM so global CSS (scriptio.css) can drop the
    // first-of-page top-margin reset in endless-scroll mode. There the page-break
    // widgets are hidden, so the reset would otherwise make each page's first
    // node stick to the previous page's content.
    useEffect(() => {
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
    // page down with `zoom` so it fits the viewport width. A fixed page rectangle
    // means its boundaries never move as you type, so there are no layout shifts.
    // `zoom` is a uniform visual scale and pagination is measured off-screen, so
    // page count / numbering are unaffected either way.
    useEffect(() => {
        const container = containerEl;
        if (!container) return;

        const pageSize = SCREENPLAY_FORMATS[pageFormat as keyof typeof SCREENPLAY_FORMATS];
        // Only the phone paged view is zoomed. Endless reflows (no zoom); desktop
        // shows the page at 1:1.
        if (!isPhone || isEndlessScroll || !pageSize) {
            container.style.removeProperty("--editor-zoom");
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
        return () => ro.disconnect();
    }, [containerEl, isPhone, isEndlessScroll, pageFormat]);

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
            editorElement.style.setProperty(
                `--${key}-decoration`,
                s.underline ? "underline" : "none",
            );
            editorElement.style.setProperty(
                `--${key}-transform`,
                s.uppercase ? "uppercase" : "none",
            );
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
                handleKeyDown(view: EditorView, event: KeyboardEvent) {
                    const selection = view.state.selection;
                    const node = selection.$anchor.parent;
                    const nodeSize = node.content.size;
                    const nodePos = selection.$head.parentOffset;
                    const currNode = node.attrs.class as ScreenplayElement;

                    if (event.key === "Backspace") {
                        // Inside a dual_dialogue_column: let the column node handle it.
                        for (let d = selection.$anchor.depth; d >= 1; d--) {
                            if (selection.$anchor.node(d).type.name === DUAL_DIALOGUE_COLUMN)
                                return false;
                        }
                        if (nodeSize === 1 && nodePos === 1) {
                            const tr = view.state.tr.delete(selection.from - 1, selection.from);
                            view.dispatch(tr);
                            return true;
                        }
                        return false;
                    }

                    if (event.code === "Space") {
                        if (
                            currNode === ScreenplayElement.Action &&
                            node.textContent.match(/^\b(int|ext)\./gi)
                        ) {
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

                        if (
                            currNode === ScreenplayElement.Dialogue &&
                            nodePos > 0 &&
                            nodePos < nodeSize
                        ) {
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
                            tr.setSelection(
                                TextSelection.create(tr.doc, insertPos + charNode.nodeSize + 1),
                            );
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

    // ---- Context menu ----
    const onEditorContextMenu = useCallback(
        (e: React.MouseEvent) => {
            if (!editor) return;
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

            // Detect a scene heading at the caret to offer "Send to outline".
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
            const onAddComment = commentNodeId
                ? () => addCommentToNode(commentNodeId)
                : undefined;

            updateContextMenu({
                type: ContextMenuType.EditorContextMenu,
                position: { x: e.clientX, y: e.clientY },
                // Pass the editor that was right-clicked: positions above are
                // resolved against it, and ProjectContext.editor is always the
                // MAIN screenplay editor — so secondary editors (tree document,
                // draft, title page) must act on this instance, not that one.
                typeSpecificProps: { editor, from, to, onAddComment, spellError, nodePos, nodeClass, outlineScene, pageBreak },
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
    const TRACK_INSET_BOTTOM = 24;

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
        const travel = Math.max(0, clientHeight - TRACK_INSET_TOP - TRACK_INSET_BOTTOM - HANDLE_HEIGHT);
        setThumbTop((scrollTop / scrollable) * travel);
    }, [containerEl]);

    // Reveal the thumb and (re)arm the timer that hides it once scrolling has
    // been idle for a beat. While dragging, keep it pinned open (no auto-hide).
    const revealScrollThumb = useCallback(() => {
        setShowScrollThumb(true);
        if (scrollIdleTimer.current) clearTimeout(scrollIdleTimer.current);
        if (!isDraggingThumb.current) {
            scrollIdleTimer.current = setTimeout(() => setShowScrollThumb(false), 1200);
        }
    }, []);

    const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (suggestions.length > 0) updateSuggestions?.([]);
        const scrollTop = e.currentTarget.scrollTop;
        setIsScrolled(scrollTop > 0);
        if (isPhone) {
            updateThumb();
            revealScrollThumb();

            // Hide the floating chrome (navbar + sidebar edge handles) while
            // scrolling down into the script so it doesn't cover the page; bring
            // it back on scroll-up or when near the top. A small threshold keeps
            // momentum jitter from flickering it.
            const delta = scrollTop - lastScrollTop.current;
            if (scrollTop <= 4) {
                setChromeHidden(false);
            } else if (delta > 6) {
                setChromeHidden(true);
            } else if (delta < -6) {
                setChromeHidden(false);
            }
            lastScrollTop.current = scrollTop;
        }
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
            revealScrollThumb();

            const startY = e.clientY;
            const startScrollTop = el.scrollTop;
            const scrollable = el.scrollHeight - el.clientHeight;
            const maxThumbTravel = el.clientHeight - TRACK_INSET_TOP - TRACK_INSET_BOTTOM - HANDLE_HEIGHT;

            const onMove = (ev: PointerEvent) => {
                if (maxThumbTravel <= 0) return;
                const delta = ev.clientY - startY;
                const ratio = (delta / maxThumbTravel) * scrollable;
                el.scrollTop = Math.max(0, Math.min(scrollable, startScrollTop + ratio));
            };
            const onUp = () => {
                isDraggingThumb.current = false;
                revealScrollThumb(); // re-arm the auto-hide now that the drag is done
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                window.removeEventListener("pointercancel", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
            window.addEventListener("pointercancel", onUp);
        },
        [containerEl, revealScrollThumb],
    );

    // Clean up the idle timer on unmount.
    useEffect(() => {
        return () => {
            if (scrollIdleTimer.current) clearTimeout(scrollIdleTimer.current);
        };
    }, []);

    // Reveal the chrome again the moment the user starts writing. The native
    // `input` event on the contenteditable fires only for real user edits — not
    // for programmatic/collaboration changes or the pagination height updates —
    // so it won't fight the scroll-hide. Off phone this is a no-op.
    useEffect(() => {
        if (!isPhone) {
            setChromeHidden(false);
            return;
        }
        const dom = editor?.view?.dom;
        if (!dom) return;
        const onInput = () => setChromeHidden(false);
        dom.addEventListener("input", onInput);
        return () => dom.removeEventListener("input", onInput);
    }, [editor, isPhone, setChromeHidden]);

    const focusType =
        focusedTypeOverride ?? (config.type === "screenplay" ? "screenplay" : "title");

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
        <div className={`${styles.editor_panel} ${isEditorReady ? styles.visible : styles.hidden}`}>
            <div
                ref={setContainerEl}
                className={styles.container}
                onScroll={onScroll}
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
                    <div
                        className={join(styles.editor_shadow, isScrolled ? styles.show_shadow : "")}
                    />
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
                    className={join(
                        styles.scroll_track,
                        showScrollThumb ? styles.scroll_track_visible : "",
                    )}
                >
                    <div
                        className={styles.scroll_handle}
                        style={{ transform: `translateY(${thumbTop}px)` }}
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
