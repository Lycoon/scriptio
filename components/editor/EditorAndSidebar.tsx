/* Tiptap */
import { Content, Editor, JSONContent, useEditor } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";

/* Components */
import EditorComponent from "./EditorComponent";
import EditorSidebarFormat from "./sidebar/EditorSidebarFormat";
import EditorSidebarNavigation from "./sidebar/EditorSidebarNavigation";
import ContextMenu from "./sidebar/ContextMenu";
import PopupCharacterItem, { PopupType } from "../popup/PopupCharacterItem";
import SuggestionMenu, { SuggestionData } from "./SuggestionMenu";
import { CustomBold, CustomItalic, CustomUnderline, Screenplay } from "../../src/Screenplay";

/* Utils */
import { useProjectFromUrl } from "../../src/lib/utils/hooks";
import Loading from "../home/Loading";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "../../src/context/UserContext";
import { useDebouncedCallback } from "use-debounce";
import { SaveStatus, ScreenplayElement } from "../../src/lib/utils/enums";
import { computeFullScenesData, countOccurrences } from "../../src/lib/screenplay";
import {
    charactersData,
    computeFullCharactersData,
    deleteCharacter,
} from "../../src/lib/utils/characters";
import { saveScreenplay } from "../../src/lib/utils/requests";
import { Project } from "../../src/lib/utils/types";

type Props = {
    project: Project;
};

const EditorAndSidebar = ({ project }: Props) => {
    const ctx = useContext(UserContext);
    const [selectedTab, updateSelectedTab] = useState<number>(0);
    const [isNavigationActive, updateIsNavigationActive] = useState<boolean>(true);

    /* Suggestion menu */
    let previousElement: string;
    const [suggestions, updateSuggestions] = useState<string[]>([]);
    const [suggestionData, updateSuggestionData] = useState<SuggestionData>({
        position: { x: 0, y: 0 },
        cursor: 0,
        cursorInNode: 0,
    });

    /* Format marks */
    const [isBold, setIsBold] = useState<boolean>(false);
    const [isItalic, setIsItalic] = useState<boolean>(false);
    const [isUnderline, setIsUnderline] = useState<boolean>(false);

    const save = async () => {
        if (ctx.saveStatus !== SaveStatus.SAVED) {
            ctx.updateSaveStatus(SaveStatus.SAVING);
            const res = await saveScreenplay(project.id, editorView?.getJSON(), charactersData);

            if (!res.ok) {
                ctx.updateSaveStatus(SaveStatus.ERROR);
                return;
            }

            ctx.updateSaveStatus(SaveStatus.SAVED);
        }
    };

    const deferredScreenplaySave = useDebouncedCallback(() => {
        save();
    }, 2000);

    const deferredSceneUpdate = useDebouncedCallback(async () => {
        computeFullScenesData(editorView?.getJSON());
    }, 1000);

    const deferredCharactersUpdate = useDebouncedCallback(async () => {
        computeFullCharactersData(editorView?.getJSON(), project.characters);
    }, 1000);

    const triggerEditorUpdate = () => {
        // Set as unsaved, to prevent data loss between typing and autosave
        ctx.updateSaveStatus(SaveStatus.NOT_SAVED);

        deferredSceneUpdate();
        deferredCharactersUpdate();

        deferredScreenplaySave();
    };

    const tabs = [
        "scene",
        "action",
        "character",
        "dialogue",
        "parenthetical",
        "transition",
        "section",
        "note",
    ];

    const updateEditorStyles = (marks: any[]) => {
        marks = marks.map((mark: any) => mark.attrs.class);

        setIsBold(marks.includes("bold"));
        setIsItalic(marks.includes("italic"));
        setIsUnderline(marks.includes("underline"));
    };

    const onCaretUpdate = (editor: Editor, anchor: any) => {
        const node = anchor.parent;
        const element = node.attrs.class;
        setActiveTab(element);

        const displaySuggestions = (list: string[], data: SuggestionData) => {
            updateSuggestions(list);
            updateSuggestionData(data);
        };

        // Leaving autocomplete
        if (previousElement === "character" && element !== "character") {
            updateSuggestions([]);
        }
        previousElement = element;

        // Autocompletion
        if (element === "character") {
            const nodeSize: number = node.content.size;
            const cursorInNode: number = anchor.parentOffset;
            const cursor: number = anchor.pos;
            const pagePos = editor.view.coordsAtPos(cursor);

            let list = Object.keys(charactersData);

            if (nodeSize > 0) {
                if (cursorInNode !== nodeSize) {
                    updateSuggestions([]);
                    return;
                }

                const text = node.textContent;
                const trimmed: string = text.slice(0, cursorInNode).toLowerCase();
                list = list
                    .filter((name) => {
                        const name_ = name.toLowerCase();
                        return name_ !== trimmed && name_.startsWith(trimmed) && name_ !== text;
                    })
                    .slice(0, 5);
            }

            // console.log(editor.view.coordsAtPos(cursor));

            displaySuggestions(list, {
                position: { x: pagePos.left, y: pagePos.top },
                cursor,
                cursorInNode,
            });
        } else if (element === "scene") {
            // TODO: Autocompletion for scenes
        }

        // Updating format marks
        if (!anchor.nodeBefore) {
            if (!anchor.nodeAfter) {
                return;
            }
            updateEditorStyles(anchor.nodeAfter?.marks);
            return;
        }
        updateEditorStyles(anchor.nodeBefore?.marks);
    };

    const editorView = useEditor({
        extensions: [
            // default
            Document,
            Text,
            History,
            CustomBold,
            CustomItalic,
            CustomUnderline,

            // scriptio
            Screenplay,
        ],
        content: project.screenplay as Content,

        // update on each screenplay update
        onUpdate({ editor, transaction }) {
            triggerEditorUpdate();
        },

        // update active on caret update
        onSelectionUpdate({ editor, transaction }) {
            const anchor = (transaction as any).curSelection.$anchor;
            onCaretUpdate(editor as Editor, anchor);
        },
    });

    editorView?.setOptions({
        autofocus: "end",
        editorProps: {
            handleKeyDown(view: any, event: any) {
                const selection = view.state.selection;
                const node = selection.$anchor.parent;
                const nodeSize = node.content.size;
                const nodePos = selection.$head.parentOffset;
                const currNode = node.attrs.class;

                if (event.code === "Space") {
                    // if starting action with INT. or EXT. switch to scene
                    if (currNode === "action" && node.textContent.match(/^\b(int|ext)\./gi)) {
                        setActiveTab("scene");
                    }
                } else if (event.key === "Enter") {
                    if (suggestions.length > 0) {
                        // prevent new line if suggestions are displayed
                        event.preventDefault();
                        return true;
                    }

                    const pos = selection.anchor;

                    // empty element
                    if (nodeSize === 0) {
                        setActiveTab("action");
                        return true;
                    }

                    if (nodePos < nodeSize) {
                        return false;
                    }

                    let newNode = "action";
                    if (nodePos !== 0) {
                        switch (currNode) {
                            case "character":
                            case "parenthetical":
                                newNode = "dialogue";
                        }
                    }

                    editorView
                        .chain()
                        .insertContentAt(pos, `<p class="${newNode}"></p>`)
                        .focus(pos)
                        .run();

                    return true;
                }

                return false;
            },
        },
    });

    const setActiveTab = (node: string) => {
        updateSelectedTab(tabs.indexOf(node));
        if (editorView) {
            editorView.chain().focus().setNode("Screenplay", { class: node }).run();
        }
    };

    const pressedKeyEvent = (e: KeyboardEvent) => {
        if (e.key === "Tab") {
            e.preventDefault();

            let idx = 0;
            switch (selectedTab) {
                case ScreenplayElement.Action:
                    idx = ScreenplayElement.Character;
                    break;
                case ScreenplayElement.Parenthetical:
                    idx = ScreenplayElement.Dialogue;
                    break;
                case ScreenplayElement.Character:
                    idx = ScreenplayElement.Action;
                    break;
                case ScreenplayElement.Dialogue:
                    idx = ScreenplayElement.Parenthetical;
            }

            setActiveTab(tabs[idx]);
        }

        if (e.ctrlKey && e.key === "s") {
            // Ctrl + S
            e.preventDefault();
            save();
        }

        if (e.ctrlKey && e.key === "x") {
            // Ctrl + X
            e.preventDefault();
            updateIsNavigationActive(!isNavigationActive);
        }

        if (e.key === "Escape") {
            ctx.updateContextMenu(undefined);
            updateSuggestions([]);
        }
    };

    /* Context menu actions */
    const getFocusOnPosition = (position: number) => {
        editorView?.commands.focus(position);
    };

    const selectTextInEditor = (start: number, end: number) => {
        editorView?.chain().focus(start).setTextSelection({ from: start, to: end }).run();
    };

    const cutTextSelection = (start: number, end: number) => {
        editorView?.commands.deleteRange({ from: start, to: end - 1 });
    };

    const copyTextSelection = (start: number, end: number) => {
        console.log("copy from " + start + " to " + end);
        //editorView?.state.doc.copy();
    };

    const replaceRange = (start: number, end: number, text: string) => {
        editorView
            ?.chain()
            .focus(start)
            .setTextSelection({ from: start, to: end })
            .insertContent(text)
            .run();
    };

    const pasteText = (text: string) => {
        editorView?.commands.insertContent(text);
    };

    const pasteTextAt = (text: string, position: number) => {
        editorView?.commands.insertContentAt(position, text);
    };

    const replaceOccurrences = (oldWord: string, newWord: string) => {
        editorView?.chain().focus().insertContentAt({ from: 0, to: 4 }, newWord).run();
    };

    const removeCharacter = (name: string) => {
        deleteCharacter(name);
    };

    /* Popup actions */
    const closePopup = () => {
        ctx.updatePopup(undefined);
    };

    const getCharacterOccurrences = (word: string): number => {
        if (!editorView) return 0;
        return countOccurrences(editorView.getJSON(), word);
    };

    const editCharacterPopup = (character: CharacterData) => {
        ctx.updatePopup(() => (
            <PopupCharacterItem
                closePopup={closePopup}
                type={PopupType.EditCharacter}
                character={character}
                getCharacterOccurrences={getCharacterOccurrences}
                replaceOccurrences={replaceOccurrences}
            />
        ));
    };

    const addCharacterPopup = () => {
        ctx.updatePopup(() => (
            <PopupCharacterItem closePopup={closePopup} type={PopupType.NewCharacter} />
        ));
    };

    /* Marks */
    const toggleBold = () => {
        editorView?.chain().toggleBold().focus().run();
        setIsBold(!isBold);
    };
    const toggleItalic = () => {
        editorView?.chain().toggleItalic().focus().run();
        setIsItalic(!isItalic);
    };
    const toggleUnderline = () => {
        editorView?.chain().toggleUnderline().focus().run();
        setIsUnderline(!isUnderline);
    };

    const onUnload = (e: BeforeUnloadEvent) => {
        if (ctx.saveStatus === SaveStatus.NOT_SAVED) {
            let confirmationMessage = "Are you sure you want to leave?";

            e.returnValue = confirmationMessage;
            return confirmationMessage;
        }

        e.preventDefault();
    };

    useEffect(() => {
        addEventListener("keydown", pressedKeyEvent);
        addEventListener("beforeunload", onUnload);
        addEventListener("onCharacterUpdate", deferredScreenplaySave);
        return () => {
            removeEventListener("keydown", pressedKeyEvent);
            removeEventListener("beforeunload", onUnload);
            removeEventListener("onCharacterUpdate", deferredScreenplaySave);
        };
    });

    useEffect(() => {
        if (editorView) {
            editorView.commands.setContent(project.screenplay as JSONContent);
            ctx.updateEditor(editorView);

            computeFullScenesData(project.screenplay);
            computeFullCharactersData(project.screenplay, project.characters);
        }
    }, [project, editorView]);

    const onScroll = (e: React.UIEvent<HTMLDivElement, UIEvent>) => {
        if (suggestions.length > 0) updateSuggestions([]);
    };

    return (
        <div id="editor-and-sidebar">
            <ContextMenu />
            {suggestions.length > 0 && (
                <SuggestionMenu
                    suggestions={suggestions}
                    suggestionData={suggestionData}
                    pasteTextAt={pasteTextAt}
                />
            )}
            {ctx.popup}
            <EditorSidebarNavigation
                active={isNavigationActive}
                getFocusOnPosition={getFocusOnPosition}
                selectTextInEditor={selectTextInEditor}
                cutTextSelection={cutTextSelection}
                pasteText={pasteText}
                copyTextSelection={copyTextSelection}
                editCharacterPopup={editCharacterPopup}
                addCharacterPopup={addCharacterPopup}
                removeCharacter={removeCharacter}
            />
            <div id="editor-container" onScroll={onScroll}>
                <EditorComponent editor={editorView} />
            </div>
            <EditorSidebarFormat
                tabs={tabs}
                toggleBold={toggleBold}
                toggleItalic={toggleItalic}
                toggleUnderline={toggleUnderline}
                isBold={isBold}
                isItalic={isItalic}
                isUnderline={isUnderline}
                selectedTab={selectedTab}
                setActiveTab={setActiveTab}
            />
        </div>
    );
};

export default EditorAndSidebar;
