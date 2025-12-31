/* Components */
import EditorSidebarFormat from "./sidebar/EditorSidebarFormat";
import EditorSidebarNavigation from "./sidebar/EditorSidebarNavigation";
import ContextMenu from "./sidebar/ContextMenu";
import SuggestionMenu, { SuggestionData } from "./SuggestionMenu";
import { applyElement, insertElement, useScriptioEditor } from "@src/lib/editor/editor";
import { Popup } from "@components/popup/Popup";
import { join } from "@src/lib/utils/misc";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";

/* Utils */
import { useContext, useEffect, useState } from "react";
import { UserContext } from "@src/context/UserContext";
import { ScreenplayElement, Style } from "@src/lib/utils/enums";

/* Styles */
import styles from "./EditorAndSidebar.module.css";
import { EditorContent } from "@node_modules/@tiptap/react/dist";

type EditorAndSidebarProps = {
    project: ProjectMembershipPayload["project"];
    css: string;
};

const EditorAndSidebar = ({ project, css }: EditorAndSidebarProps) => {
    const userCtx = useContext(UserContext);

    const [isScrolled, setIsScrolled] = useState(false);
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
        if (applyStyle && editor) applyElement(editor, element);
    };

    const editor = useScriptioEditor(
        project,
        setActiveElement,
        setSelectedStyles,
        updateSuggestions,
        updateSuggestionData
    );

    editor?.setOptions({
        autofocus: "start",
        editorProps: {
            handleScrollToSelection: () => true,
            handleKeyDown(view: any, event: any) {
                const selection = view.state.selection;
                const node = selection.$anchor.parent;
                const nodeSize = node.content.size;
                const nodePos = selection.$head.parentOffset;
                const currNode = node.attrs.class as ScreenplayElement;

                if (event.key === "Backspace") {
                    if (currNode === ScreenplayElement.Scene && nodeSize === 1 && nodePos === 1) {
                        const tr = view.state.tr.delete(selection.from - 1, selection.from);
                        view.dispatch(tr);
                        return true;
                    }
                }

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

                    insertElement(editor, newNode, selection.anchor);
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
        }

        // Escape
        if (e.key === "Escape") {
            userCtx.updateContextMenu(undefined);
            updateSuggestions([]);
        }
    };

    // Initialize event listeners on mount
    useEffect(() => {
        addEventListener("keydown", pressedKeyEvent);
        return () => {
            removeEventListener("keydown", pressedKeyEvent);
        };
    }, [pressedKeyEvent]);

    const onScroll = (e: React.UIEvent<HTMLDivElement, UIEvent>) => {
        if (suggestions.length > 0) updateSuggestions([]);
        const scrollTop = e.currentTarget.scrollTop;
        setIsScrolled(scrollTop > 0);
    };

    return (
        <div className={join(styles.editor_and_sidebar, css)}>
            <ContextMenu />
            {suggestions.length > 0 && <SuggestionMenu suggestions={suggestions} suggestionData={suggestionData} />}
            <Popup />
            <EditorSidebarNavigation />
            <div className={styles.container} onScroll={onScroll}>
                <div className={join(styles.editor_shadow, isScrolled ? styles.show_shadow : "")} />
                <EditorContent editor={editor} />
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
