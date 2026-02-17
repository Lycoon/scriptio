"use client";

import { applyElement, insertElement, useScriptioEditor } from "@src/lib/screenplay/editor";
import { SuggestionData } from "./SuggestionMenu";
import { join } from "@src/lib/utils/misc";

import { useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { UserContext } from "@src/context/UserContext";
import { ScreenplayElement } from "@src/lib/utils/enums";

import styles from "./EditorPanel.module.css";
import { EditorContent } from "@node_modules/@tiptap/react/dist";
import Loading from "@components/utils/Loading";
import { useGlobalKeybinds, useProjectMembership, useSettings } from "@src/lib/utils/hooks";
import { ProjectContext } from "@src/context/ProjectContext";
import CommentCards from "./CommentCards";
import { ContextMenuType } from "./sidebar/ContextMenu";

interface EditorPanelProps {
    isVisible: boolean;
    suggestions: string[];
    updateSuggestions: (suggestions: string[]) => void;
    suggestionData: SuggestionData;
    updateSuggestionData: (data: SuggestionData) => void;
}

const EditorPanel = ({ isVisible, suggestions, updateSuggestions, suggestionData, updateSuggestionData }: EditorPanelProps) => {
    const { membership, isLoading } = useProjectMembership();
    const { isZenMode, updateIsZenMode, updateContextMenu } = useContext(UserContext);
    const {
        isYjsReady,
        selectedElement,
        setSelectedElement,
        selectedStyles,
        setSelectedStyles,
        displaySceneNumbers,
        sceneHeadingBold,
        sceneHeadingDoubleSpace,
        sceneNumberOnRight,
        contdLabel,
        setActiveCommentId,
        setFocusedEditorType,
    } = useContext(ProjectContext);
    const { settings } = useSettings();

    const [isEditorReady, setIsEditorReady] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);

    const globalActions = useMemo(
        () => ({
            toggleFocusMode: () => updateIsZenMode((prev) => !prev),
            saveProject: () => console.log("Project Saved"),
        }),
        [],
    );

    useGlobalKeybinds(settings?.keybinds, globalActions);

    const updateActiveElement = useCallback(
        (element: ScreenplayElement) => {
            setSelectedElement(element);
        },
        [setSelectedElement],
    );

    const editor = useScriptioEditor(
        membership?.project,
        updateActiveElement,
        setSelectedStyles,
        updateSuggestions,
        updateSuggestionData,
        settings?.keybinds,
        globalActions,
    );

    const setActiveElement = useCallback(
        (element: ScreenplayElement, applyStyle = true) => {
            setSelectedElement(element);
            if (applyStyle && editor) applyElement(editor, element);
        },
        [setSelectedElement, editor],
    );

    useEffect(() => {
        if (editor && isYjsReady) {
            const timer = setTimeout(() => setIsEditorReady(true), 500);
            return () => clearTimeout(timer);
        }
    }, [editor, isYjsReady]);

    useEffect(() => {
        if (!editor || editor.isDestroyed || !editor.view?.dom) return;

        const editorElement = editor.view.dom;

        // Scene numbers visibility
        if (displaySceneNumbers) {
            editorElement.classList.remove("hide-scene-numbers");
        } else {
            editorElement.classList.add("hide-scene-numbers");
        }

        // Scene heading bold
        if (sceneHeadingBold) {
            editorElement.classList.remove("scene-heading-normal");
        } else {
            editorElement.classList.add("scene-heading-normal");
        }

        // Scene heading double space
        if (sceneHeadingDoubleSpace) {
            editorElement.classList.add("scene-heading-double-space");
        } else {
            editorElement.classList.remove("scene-heading-double-space");
        }

        // Scene number on right (class kept for potential future CSS use)
        if (sceneNumberOnRight) {
            editorElement.classList.add("scene-number-right");
        } else {
            editorElement.classList.remove("scene-number-right");
        }

        // CONT'D label
        editorElement.style.setProperty("--contd-label", `"${contdLabel}"`);

        // Focus editor to trigger pagination recompute (only when visible to avoid stealing focus)
        if (isVisible) {
            editor.commands.focus();
        }
    }, [editor, isVisible, displaySceneNumbers, sceneHeadingBold, sceneHeadingDoubleSpace, sceneNumberOnRight, contdLabel]);

    useEffect(() => {
        if (!editor) return;

        editor.setOptions({
            editorProps: {
                handleScrollToSelection: () => true,
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
                            setActiveElement(ScreenplayElement.Scene);
                        }
                        return false;
                    }

                    if (event.key === "Enter") {
                        if (suggestions.length > 0) {
                            event.preventDefault();
                            return true;
                        }

                        if (nodePos < nodeSize) {
                            return false;
                        }

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
    }, [editor]);

    const selectedElementRef = useRef(selectedElement);
    const setActiveElementRef = useRef(setActiveElement);
    const updateContextMenuRef = useRef(updateContextMenu);
    const updateSuggestionsRef = useRef(updateSuggestions);

    useEffect(() => {
        selectedElementRef.current = selectedElement;
    }, [selectedElement]);

    useEffect(() => {
        setActiveElementRef.current = setActiveElement;
    }, [setActiveElement]);

    useEffect(() => {
        updateContextMenuRef.current = updateContextMenu;
    }, [updateContextMenu]);

    useEffect(() => {
        updateSuggestionsRef.current = updateSuggestions;
    }, [updateSuggestions]);

    useEffect(() => {
        if (!isVisible) return;

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
                }
            }

            if (e.ctrlKey && e.key === "s") {
                e.preventDefault();
            }

            if (e.key === "Escape") {
                updateContextMenuRef.current(undefined);
                updateSuggestionsRef.current([]);
            }
        };

        addEventListener("keydown", pressedKeyEvent);
        return () => {
            removeEventListener("keydown", pressedKeyEvent);
        };
    }, [isVisible]);

    const onScroll = (e: React.UIEvent<HTMLDivElement, UIEvent>) => {
        if (suggestions.length > 0) updateSuggestions([]);
        const scrollTop = e.currentTarget.scrollTop;
        setIsScrolled(scrollTop > 0);
    };

    const onEditorContextMenu = useCallback(
        (e: React.MouseEvent) => {
            if (!editor) return;

            const { from, to } = editor.state.selection;
            if (from === to) return;

            e.preventDefault();
            updateContextMenu({
                type: ContextMenuType.EditorSelection,
                position: { x: e.clientX, y: e.clientY },
                typeSpecificProps: { from, to },
            });
        },
        [editor, updateContextMenu],
    );

    // Clear active comment on mousedown anywhere in the container.
    // Uses mousedown so it fires *before* ProseMirror processes the click;
    // the editor's onSelectionUpdate will then override with the correct
    // comment ID if the cursor lands on a comment mark.
    const handleContainerMouseDown = useCallback(() => {
        setActiveCommentId(null);
    }, [setActiveCommentId]);

    const isDesktop = isTauri();
    if (!isDesktop && (!membership || isLoading)) return <Loading />;

    return (
        <div className={`${styles.editor_panel} ${isEditorReady ? styles.visible : styles.hidden}`}>
            <div className={styles.container} onScroll={onScroll} onMouseDown={handleContainerMouseDown} onFocus={() => setFocusedEditorType("screenplay")}>
                <div className={styles.editor_wrapper}>
                    <div className={join(styles.editor_shadow, isScrolled ? styles.show_shadow : "")} />
                    <div onContextMenu={onEditorContextMenu}>
                        <EditorContent editor={editor} spellCheck={false} />
                    </div>
                </div>
                <CommentCards />
            </div>
        </div>
    );
};

export default EditorPanel;
