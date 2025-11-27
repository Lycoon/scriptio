/* Components */
import EditorSidebarFormat from "../sidebar/EditorSidebarFormat";
import EditorSidebarNavigation from "../sidebar/EditorSidebarNavigation";
import ContextMenu from "../sidebar/ContextMenu";
import SuggestionMenu, { SuggestionData } from "../SuggestionMenu";

/* Utils */
import { useContext, useEffect, useState } from "react";
import { UserContext } from "@src/context/UserContext";
import { SaveStatus, ScreenplayElement, Style } from "@src/lib/utils/enums";
import { computeFullScenesData } from "@src/lib/editor/screenplay";
import { Project } from "@src/lib/utils/types";
import { computeFullCharactersData } from "@src/lib/editor/characters";

/* Styles */
import styles from "./ScreenplayAndSidebars.module.css";
import { ProjectContext } from "@src/context/ProjectContext";
import { applyElement, insertElement, insertPage, insertPageBreak, useScreenplayEditor } from "@src/lib/editor/editor";
import { Popup } from "@components/popup/Popup";
import ScreenplayEditor from "./ScreenplayEditor";

type ScreenplayAndSidebarsProps = {
    project: Project;
};

const ScreenplayAndSidebars = ({ project }: ScreenplayAndSidebarsProps) => {
    const userCtx = useContext(UserContext);
    const projectCtx = useContext(ProjectContext);

    const [selectedStyles, setSelectedStyles] = useState<Style>(Style.None);
    const [selectedElement, setSelectedElement] = useState<ScreenplayElement>(ScreenplayElement.Action);

    /* Suggestion menu */
    const [suggestions, updateSuggestions] = useState<string[]>([]);
    const [suggestionData, updateSuggestionData] = useState<SuggestionData>({
        position: { x: 0, y: 0 },
        cursor: 0,
        cursorInNode: 0,
    });

    const setActiveElement = (element: ScreenplayElement, applyStyle = true) => {
        setSelectedElement(element);
        if (applyStyle && screenplayEditor) applyElement(screenplayEditor, element);
    };

    const screenplayEditor = useScreenplayEditor(
        project.screenplay,
        setActiveElement,
        setSelectedStyles,
        updateSuggestions,
        updateSuggestionData
    );

    screenplayEditor?.setOptions({
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
                        return false; // prevent default new line
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

                    insertElement(screenplayEditor, newNode, selection.anchor);
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

        if (e.key === "F2") {
            insertPage(screenplayEditor!, screenplayEditor?.state.selection.anchor!);
        }

        // Ctrl + S
        if (e.ctrlKey && e.key === "s") {
            e.preventDefault();
        }

        // Escape
        if (e.key === "Escape") {
            userCtx.updateContextMenu(undefined);
            updateSuggestions([]);
        }
    };

    /* Context menu actions */
    const onUnload = (e: BeforeUnloadEvent) => {
        if (projectCtx.saveStatus === SaveStatus.Saving) {
            return "Are you sure you want to leave?";
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

    useEffect(() => {
        computeFullScenesData(project.screenplay, projectCtx);
        computeFullCharactersData(project.screenplay, projectCtx);
    }, [screenplayEditor]);

    const onScroll = (e: React.UIEvent<HTMLDivElement, UIEvent>) => {
        if (suggestions.length > 0) updateSuggestions([]);
    };

    return (
        <div className={styles.container}>
            <ContextMenu />
            {suggestions.length > 0 && <SuggestionMenu suggestions={suggestions} suggestionData={suggestionData} />}
            <Popup />
            <EditorSidebarNavigation />
            <div className={styles.screenplay} onScroll={onScroll}>
                <ScreenplayEditor editor={screenplayEditor} />
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

export default ScreenplayAndSidebars;
