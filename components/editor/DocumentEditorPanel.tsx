"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { EditorContent } from "@tiptap/react";

import { applyElement, insertElement, SCREENPLAY_FORMATS } from "@src/lib/screenplay/editor";
import { ScreenplayElement } from "@src/lib/utils/enums";
import { DEFAULT_ELEMENT_MARGINS, DEFAULT_ELEMENT_STYLES } from "@src/lib/project/project-state";
import { join } from "@src/lib/utils/misc";
import { useGlobalKeybinds, useProjectMembership, useSettings } from "@src/lib/utils/hooks";
import { ProjectContext } from "@src/context/ProjectContext";
import { useViewContext } from "@src/context/ViewContext";
import { ContextMenuType } from "@components/editor/sidebar/ContextMenu";
import { UserContext } from "@src/context/UserContext";
import { useUser } from "@src/lib/utils/hooks";
import CommentCards from "@components/editor/CommentCards";
import Loading from "@components/utils/Loading";

import { TextSelection } from "@tiptap/pm/state";
import { DocumentEditorConfig } from "@src/lib/editor/document-editor-config";
import { useDocumentComments } from "@src/lib/editor/use-document-comments";
import { useDocumentEditor } from "@src/lib/editor/use-document-editor";
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
}

const DocumentEditorPanel = ({
    config,
    isVisible,
    onEditorCreated,
    suggestions = [],
    updateSuggestions,
    suggestionData,
    updateSuggestionData,
    userKeybinds,
    globalContext,
}: DocumentEditorPanelProps) => {
    const { membership, isLoading } = useProjectMembership();
    const { updateContextMenu } = useContext(UserContext);
    const projectCtx = useContext(ProjectContext);
    const {
        isYjsReady,
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
        elementMargins,
        elementStyles,
        setFocusedEditorType,
        setSelectedTitlePageElement,
        repository,
    } = projectCtx;
    const { settings } = useSettings();
    const { isEndlessScroll, showComments } = useViewContext();
    const { user } = useUser();

    const [isEditorReady, setIsEditorReady] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);

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
        setActiveCommentId: commentOps.setActiveCommentId,
        userKeybinds: keybinds,
        globalContext,
        setSelectedTitlePageElement,
    });

    // Register the editor instance with the parent wrapper
    useEffect(() => {
        onEditorCreated?.(editor);
        return () => { onEditorCreated?.(null); };
    }, [editor, onEditorCreated]);

    // Ready state
    useEffect(() => {
        if (editor && isYjsReady) {
            const timer = setTimeout(() => setIsEditorReady(true), 500);
            return () => clearTimeout(timer);
        }
    }, [editor, isYjsReady]);

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

        editorElement.style.setProperty("--contd-label", `"${contdLabel}"`);
        editorElement.style.setProperty("--more-label", `"${moreLabel}"`);

        const elementKeys = ["action", "scene", "character", "dialogue", "parenthetical", "transition", "section"] as const;
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
                .updatePageSize(pageSize)
                .updateMargins({
                    top: pageMargins.top * 96,
                    bottom: pageMargins.bottom * 96,
                    left: pageMargins.left * 96,
                    right: pageMargins.right * 96,
                })
                .run();

        }

        if (isVisible) {
            editor.commands.focus();
        }
    }, [editor, isVisible, config.type, pageFormat, pageMargins, displaySceneNumbers, sceneHeadingSpacing, sceneNumberOnRight, contdLabel, moreLabel, elementMargins, elementStyles]);

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

    useEffect(() => { selectedElementRef.current = selectedElement; }, [selectedElement]);
    useEffect(() => { updateContextMenuRef.current = updateContextMenu; }, [updateContextMenu]);
    useEffect(() => { updateSuggestionsRef.current = updateSuggestions; }, [updateSuggestions]);

    const setActiveElement = useCallback(
        (element: ScreenplayElement, applyStyle = true) => {
            setSelectedElement(element);
            if (applyStyle && editor) applyElement(editor, element);
        },
        [setSelectedElement, editor],
    );

    const setActiveElementRef = useRef(setActiveElement);
    useEffect(() => { setActiveElementRef.current = setActiveElement; }, [setActiveElement]);

    useEffect(() => {
        if (!editor || config.type !== "screenplay") return;

        editor.setOptions({
            editorProps: {
                handleKeyDown(view: any, event: any) {
                    const selection = view.state.selection;
                    const node = selection.$anchor.parent;
                    const nodeSize = node.content.size;
                    const nodePos = selection.$head.parentOffset;
                    const currNode = node.attrs.class as ScreenplayElement;

                    if (event.key === "Backspace") {
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
                        const currentSuggestions = updateSuggestionsRef.current;
                        // suggestions.length check: read from ref to avoid stale closure
                        if (suggestions.length > 0) {
                            event.preventDefault();
                            return true;
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
                                if (child.attrs.class !== ScreenplayElement.Parenthetical && child.attrs.class !== ScreenplayElement.Dialogue) break;
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
    }, [editor, config.type]);

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
    }, [isVisible, config.type]);

    // ---- Context menu ----
    const onEditorContextMenu = useCallback(
        (e: React.MouseEvent) => {
            if (!editor) return;
            const { from, to } = editor.state.selection;
            if (from === to) return;

            e.preventDefault();

            const onAddComment = () => {
                if (!editor) return;
                const commentId = commentOps.addComment({
                    text: "",
                    author: user?.username || "Anonymous",
                    createdAt: Date.now(),
                    resolved: false,
                    replies: [],
                });
                editor.chain().setTextSelection({ from, to }).setComment(commentId).run();
                commentOps.setActiveCommentId(commentId);
            };

            updateContextMenu({
                type: ContextMenuType.EditorSelection,
                position: { x: e.clientX, y: e.clientY },
                typeSpecificProps: { from, to, onAddComment },
            });
        },
        [editor, updateContextMenu, commentOps, user],
    );

    // Clear active comment on mousedown
    const handleContainerMouseDown = useCallback(() => {
        commentOps.setActiveCommentId(null);
    }, [commentOps]);

    const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (suggestions.length > 0) updateSuggestions?.([]);
        const scrollTop = e.currentTarget.scrollTop;
        setIsScrolled(scrollTop > 0);
    };

    const focusType = config.type === "screenplay" ? "screenplay" : "title";

    const isDesktop = isTauri();
    if (!isDesktop && (!membership || isLoading)) return <Loading />;

    return (
        <div className={`${styles.editor_panel} ${isEditorReady ? styles.visible : styles.hidden}`}>
            <div
                className={`${styles.container} ${!showComments ? "hide-comments" : ""}`}
                onScroll={onScroll}
                onMouseDown={handleContainerMouseDown}
                onFocus={() => setFocusedEditorType(focusType)}
            >
                <div className={`${styles.editor_wrapper} ${isEndlessScroll ? styles.endless_scroll : ""}`}>
                    <div className={join(styles.editor_shadow, isScrolled ? styles.show_shadow : "")} />
                    <div onContextMenu={config.features.comments ? onEditorContextMenu : undefined}>
                        <EditorContent editor={editor} spellCheck={false} />
                    </div>
                </div>
                {config.features.comments && (
                    <CommentCards
                        editor={editor}
                        comments={commentOps.comments}
                        activeCommentId={commentOps.activeCommentId}
                        setActiveCommentId={commentOps.setActiveCommentId}
                        onUpdateComment={(id, data) => commentOps.updateComment(id, data)}
                        onDeleteComment={(id) => commentOps.deleteComment(id)}
                        onAddReply={(commentId, text, author) =>
                            commentOps.addReply(commentId, { text, author, createdAt: Date.now() })
                        }
                    />
                )}
            </div>
        </div>
    );
};

export default DocumentEditorPanel;
