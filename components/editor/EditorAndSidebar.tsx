/* Tiptap */
import { Editor, JSONContent } from "@tiptap/react";

/* Components */
import EditorComponent from "./EditorComponent";
import EditorSidebarFormat from "./sidebar/EditorSidebarFormat";
import EditorSidebarNavigation from "./sidebar/EditorSidebarNavigation";
import ContextMenu from "./sidebar/ContextMenu";
import PopupCharacterItem, { PopupType } from "../popup/PopupCharacterItem";
import SuggestionMenu, { SuggestionData } from "./SuggestionMenu";

/* Utils */
import { useContext, useEffect, useState } from "react";
import { UserContext } from "@src/context/UserContext";
import { SaveStatus, ScreenplayElement, Style } from "@src/lib/utils/enums";
import { computeFullScenesData, countOccurrences } from "@src/lib/editor/screenplay";
import { Project } from "@src/lib/utils/types";
import { CharacterData, computeFullCharactersData, deleteCharacter } from "@src/lib/editor/characters";

/* Styles */
import editor_ from "./EditorAndSidebar.module.css";
import { ProjectContext } from "@src/context/ProjectContext";
import { applyElement, save, insertElement, useScriptioEditor } from "@src/lib/editor/editor";

type EditorAndSidebarProps = {
    project: Project;
};

const EditorAndSidebar = ({ project }: EditorAndSidebarProps) => {
    const userCtx = useContext(UserContext);
    const projectCtx = useContext(ProjectContext);

    const [selectedStyles, setSelectedStyles] = useState<Style>(Style.None);
    const [selectedElement, setSelectedElement] = useState<ScreenplayElement>(ScreenplayElement.Action);
    const [isNavigationActive, setIsNavigationActive] = useState<boolean>(true);

    /* Suggestion menu */
    const [suggestions, updateSuggestions] = useState<string[]>([]);
    const [suggestionData, updateSuggestionData] = useState<SuggestionData>({
        position: { x: 0, y: 0 },
        cursor: 0,
        cursorInNode: 0,
    });

    const setActiveElement = (element: ScreenplayElement, applyStyle = true) => {
        setSelectedElement(element);
        if (applyStyle && editorView) applyElement(editorView, element);
    };

    const editorView = useScriptioEditor(setActiveElement, setSelectedStyles, updateSuggestions, updateSuggestionData);

    editorView?.setOptions({
        autofocus: "end",
        editorProps: {
            handleKeyDown(view: any, event: any) {
                const selection = view.state.selection;
                const node = selection.$anchor.parent;
                const nodeSize = node.content.size;
                const nodePos = selection.$head.parentOffset;
                const currNode = node.attrs.class as ScreenplayElement;

                if (event.code === "Space") {
                    // if starting action with INT. or EXT. switch to scene
                    if (currNode === ScreenplayElement.Action && node.textContent.match(/^\b(int|ext)\./gi)) {
                        setActiveElement(ScreenplayElement.Scene);
                    }
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

                    insertElement(editorView, newNode, selection.anchor);
                    return true; // prevent default new line
                }

                return false;
            },
        },
    });

    const pressedKeyEvent = (e: KeyboardEvent) => {
        // Tab
        if (e.key === "Tab") {
            e.preventDefault();

            switch (selectedElement) {
                case ScreenplayElement.Action:
                    setActiveElement(ScreenplayElement.Character);
                    break;
                case ScreenplayElement.Parenthetical:
                    setActiveElement(ScreenplayElement.Dialogue);
                    break;
                case ScreenplayElement.Character:
                    setActiveElement(ScreenplayElement.Action);
                    break;
                case ScreenplayElement.Dialogue:
                    setActiveElement(ScreenplayElement.Parenthetical);
            }
        }

        // Ctrl + S
        if (e.ctrlKey && e.key === "s") {
            e.preventDefault();
            save(editorView?.getJSON(), projectCtx);
        }

        // Ctrl + X
        if (e.ctrlKey && e.key === "x") {
            e.preventDefault();
            setIsNavigationActive(!isNavigationActive);
        }

        // Escape
        if (e.key === "Escape") {
            userCtx.updateContextMenu(undefined);
            updateSuggestions([]);
        }
    };

    /* Context menu actions */
    const removeCharacter = (name: string) => {
        deleteCharacter(name, projectCtx);
    };

    /* Popup actions */
    const closePopup = () => {
        userCtx.updatePopup(undefined);
    };

    const getCharacterOccurrences = (word: string): number => {
        if (!editorView) return 0;
        return countOccurrences(editorView.getJSON(), word);
    };

    const editCharacterPopup = (character: CharacterData) => {
        userCtx.updatePopup(() => (
            <PopupCharacterItem
                closePopup={closePopup}
                type={PopupType.EditCharacter}
                character={character}
                getCharacterOccurrences={getCharacterOccurrences}
            />
        ));
    };

    const addCharacterPopup = () => {
        userCtx.updatePopup(() => <PopupCharacterItem closePopup={closePopup} type={PopupType.NewCharacter} />);
    };

    const onUnload = (e: BeforeUnloadEvent) => {
        if (projectCtx.saveStatus === SaveStatus.NotSaved) {
            let confirmationMessage = "Are you sure you want to leave?";

            e.returnValue = confirmationMessage;
            return confirmationMessage;
        }
    };

    // Initialize event listeners on mount
    useEffect(() => {
        addEventListener("keydown", pressedKeyEvent);
        addEventListener("beforeunload", onUnload);
        return () => {
            removeEventListener("keydown", pressedKeyEvent);
            removeEventListener("beforeunload", onUnload);
        };
    }, [pressedKeyEvent, onUnload]);

    // Update editor content on first load
    useEffect(() => {
        if (editorView) {
            editorView.commands.setContent(project.screenplay as JSONContent);
            userCtx.updateEditor(editorView);

            computeFullScenesData(project.screenplay, projectCtx);
            computeFullCharactersData(project.screenplay, projectCtx);
        }
    }, [project, editorView]);

    const onScroll = (e: React.UIEvent<HTMLDivElement, UIEvent>) => {
        if (suggestions.length > 0) updateSuggestions([]);
    };

    return (
        <div className={editor_.editor_and_sidebar}>
            <ContextMenu />
            {suggestions.length > 0 && <SuggestionMenu suggestions={suggestions} suggestionData={suggestionData} />}
            {userCtx.popup}
            <EditorSidebarNavigation
                active={isNavigationActive}
                editCharacterPopup={editCharacterPopup}
                addCharacterPopup={addCharacterPopup}
                removeCharacter={removeCharacter}
            />
            <div className={editor_.container} onScroll={onScroll}>
                <EditorComponent editor={editorView} />
            </div>
            <EditorSidebarFormat
                selectedStyles={selectedStyles}
                setActiveStyles={setSelectedStyles}
                selectedElement={selectedElement}
                setActiveElement={setActiveElement}
            />
        </div>
    );
};

export default EditorAndSidebar;
