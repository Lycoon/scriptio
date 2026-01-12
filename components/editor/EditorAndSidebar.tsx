"use client";

/* Components */
import EditorSidebarNavigation from "./sidebar/EditorSidebarNavigation";
import ContextMenu from "./sidebar/ContextMenu";
import SuggestionMenu, { SuggestionData } from "./SuggestionMenu";
import { applyElement, insertElement, useScriptioEditor } from "@src/lib/screenplay/editor";
import { Popup } from "@components/popup/Popup";
import { join } from "@src/lib/utils/misc";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";

/* Utils */
import { useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { UserContext } from "@src/context/UserContext";
import { ScreenplayElement, Style } from "@src/lib/utils/enums";

/* Styles */
import styles from "./EditorAndSidebar.module.css";
import { EditorContent } from "@node_modules/@tiptap/react/dist";
import Loading from "@components/utils/Loading";
import { useGlobalKeybinds, useProjectMembership, useSettings } from "@src/lib/utils/hooks";
import { ProjectContext } from "@src/context/ProjectContext";
import EditorSidebarFormat from "./sidebar/EditorSidebarFormat";

const EditorAndSidebar = () => {
    const { membership, isLoading } = useProjectMembership();
    const { isZenMode, updateIsZenMode, updateContextMenu } = useContext(UserContext);
    const { isYjsReady, selectedElement, setSelectedElement, selectedStyles, setSelectedStyles } =
        useContext(ProjectContext);
    const { settings } = useSettings();

    const [isEditorReady, setIsEditorReady] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);

    /* Suggestion menu */
    const [suggestions, updateSuggestions] = useState<string[]>([]);
    const [suggestionData, updateSuggestionData] = useState<SuggestionData>({
        position: { x: 0, y: 0 },
        cursor: 0,
        cursorInNode: 0,
    });

    const globalActions = useMemo(
        () => ({
            toggleFocusMode: () => updateIsZenMode((prev) => !prev),
            saveProject: () => console.log("Project Saved"),
        }),
        []
    );

    useGlobalKeybinds(settings?.keybinds, globalActions);

    // Simple function to update element state (used by the editor hook)
    const updateActiveElement = useCallback(
        (element: ScreenplayElement) => {
            setSelectedElement(element);
        },
        [setSelectedElement]
    );

    const editor = useScriptioEditor(
        membership?.project,
        updateActiveElement,
        setSelectedStyles,
        updateSuggestions,
        updateSuggestionData,
        settings?.keybinds,
        globalActions
    );

    // Function to set element and apply to editor (used by keyboard handlers)
    const setActiveElement = useCallback(
        (element: ScreenplayElement, applyStyle = true) => {
            setSelectedElement(element);
            if (applyStyle && editor) applyElement(editor, element);
        },
        [setSelectedElement, editor]
    );

    useEffect(() => {
        if (editor && isYjsReady) {
            // A small timeout ensures the collaboration is synced
            const timer = setTimeout(() => setIsEditorReady(true), 500);
            return () => clearTimeout(timer);
        }
    }, [editor, isYjsReady]);

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
                        // When deleting the last character, manually delete just the character.
                        // This prevents an issue where paragraphs with display: inline-block
                        // get deleted entirely instead of becoming empty.
                        if (nodeSize === 1 && nodePos === 1) {
                            const tr = view.state.tr.delete(selection.from - 1, selection.from);
                            view.dispatch(tr);
                            return true;
                        }

                        return false;
                    }

                    if (event.code === "Space") {
                        // if starting action with INT. or EXT. switch to scene
                        if (currNode === ScreenplayElement.Action && node.textContent.match(/^\b(int|ext)\./gi)) {
                            setActiveElement(ScreenplayElement.Scene);
                        }
                        return false;
                    }

                    if (event.key === "Enter") {
                        // autocomplete open
                        if (suggestions.length > 0) {
                            event.preventDefault();
                            return true; // prevent default new line
                        }

                        // empty element
                        if (nodeSize === 0) {
                            setActiveElement(ScreenplayElement.Action);
                            return true; // prevent default new line
                        }

                        // breaking line in the middle of an element
                        if (nodePos < nodeSize) {
                            return false;
                        }

                        // default case, most likely a new element
                        let newNode = ScreenplayElement.Action;
                        if (nodePos !== 0) {
                            switch (currNode) {
                                case ScreenplayElement.Character:
                                case ScreenplayElement.Parenthetical:
                                    newNode = ScreenplayElement.Dialogue;
                            }
                        }

                        insertElement(editor, newNode, selection.anchor);
                        return true; // prevent default new line
                    }

                    return false;
                },
            },
        });
    }, [editor]);

    // Use refs to avoid recreating the event handler on every render
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

    // Initialize event listeners on mount only
    useEffect(() => {
        const pressedKeyEvent = (e: KeyboardEvent) => {
            // Tab
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

            // Ctrl + S
            if (e.ctrlKey && e.key === "s") {
                e.preventDefault();
            }

            // Escape
            if (e.key === "Escape") {
                updateContextMenuRef.current(undefined);
                updateSuggestionsRef.current([]);
            }
        };

        addEventListener("keydown", pressedKeyEvent);
        return () => {
            removeEventListener("keydown", pressedKeyEvent);
        };
    }, []);

    const onScroll = (e: React.UIEvent<HTMLDivElement, UIEvent>) => {
        if (suggestions.length > 0) updateSuggestions([]);
        const scrollTop = e.currentTarget.scrollTop;
        setIsScrolled(scrollTop > 0);
    };

    if (!membership || isLoading) return <Loading />;

    return (
        <div className={join(styles.editor_and_sidebar)}>
            <ContextMenu />
            {suggestions.length > 0 && <SuggestionMenu suggestions={suggestions} suggestionData={suggestionData} />}
            <Popup />
            <EditorSidebarNavigation />
            <div className={`${styles.container}`} onScroll={onScroll}>
                {/* Upper editor shadow */}
                <div className={join(styles.editor_shadow, isScrolled ? styles.show_shadow : "")} />

                {/* Scriptio Editor */}
                <div className={isEditorReady ? styles.visible : styles.hidden}>
                    <EditorContent editor={editor} />
                </div>

                {!isEditorReady && (
                    <div className={`${styles.loading}`}>
                        <Loading />
                    </div>
                )}
            </div>
            <EditorSidebarFormat />
        </div>
    );
};

export default EditorAndSidebar;
