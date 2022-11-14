import { Extension, JSONContent, useEditor } from "@tiptap/react";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "../../src/context/UserContext";
import { CustomBold, CustomItalic, CustomUnderline, Screenplay } from "../../src/Screenplay";
import EditorComponent from "./EditorComponent";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";
import { Project } from "../../pages/api/users";
import { saveProjectCharacters, saveScreenplay } from "../../src/lib/requests";
import { useDebouncedCallback } from "use-debounce";
import {
    computeFullScenesData,
    computeFullCharactersData,
    CharacterData,
    countOccurrences,
    deleteCharacter,
    getCharactersData,
} from "../../src/lib/screenplayUtils";
import EditorSidebarFormat, { ScreenplayElement } from "./sidebar/EditorSidebarFormat";
import EditorSidebarNavigation from "./sidebar/EditorSidebarNavigation";
import ContextMenu from "./sidebar/ContextMenu";
import PopupCharacterItem, { PopupType } from "../popup/PopupCharacterItem";
import Suggestion, { SuggestionProps } from "@tiptap/suggestion";

type Props = {
    project: Project;
};

const EditorAndSidebar = ({ project }: Props) => {
    const { updateEditor, updateIsSaving } = useContext(UserContext);
    const [selectedTab, updateSelectedTab] = useState<number>(0);
    const [isSaved, updateIsSaved] = useState<boolean>(false);
    const [isPopupActive, updatePopupActive] = useState<boolean>(false);
    const [isNavigationActive, updateIsNavigationActive] = useState<boolean>(true);

    /* Format marks */
    const [isBold, setIsBold] = useState<boolean>(false);
    const [isItalic, setIsItalic] = useState<boolean>(false);
    const [isUnderline, setIsUnderline] = useState<boolean>(false);

    const save = () => {
        if (!isSaved) {
            updateIsSaving(true);
            saveScreenplay(project.userId, project.id, editorView?.getJSON());
            updateIsSaved(true);
            setTimeout(() => {
                // loading animation
                updateIsSaving(false);
            }, 1500);
        }
    };

    const deferredSave = useDebouncedCallback(() => {
        save();
    }, 2000);

    const deferredSceneUpdate = useDebouncedCallback(async () => {
        computeFullScenesData(editorView?.getJSON());
    }, 1000);

    const deferredCharactersUpdate = useDebouncedCallback(() => {
        saveProjectCharacters(project.userId, project.id, getCharactersData());
    }, 500);

    const updateEditorStyles = (marks: any[]) => {
        marks = marks.map((mark: any) => mark.attrs.class);

        setIsBold(marks.includes("bold"));
        setIsItalic(marks.includes("italic"));
        setIsUnderline(marks.includes("underline"));
    };

    const onCaretUpdate = (anchor: any) => {
        const currNode = anchor.path[3].attrs.class;
        setActiveTab(currNode);

        if (!anchor.nodeBefore) {
            if (!anchor.nodeAfter) {
                return;
            }
            updateEditorStyles(anchor.nodeAfter?.marks);
            return;
        }
        updateEditorStyles(anchor.nodeBefore?.marks);
    };

    const ScreenplaySuggestion = Extension.create({
        name: "ScreenplaySuggestion",

        addProseMirrorPlugins() {
            return [
                Suggestion<any>({
                    editor: this.editor,
                    char: "",
                    startOfLine: true,
                    allowSpaces: true,
                    allow: ({ editor, state, range }) => {
                        const node = state.selection.$anchor.parent.attrs.class;
                        return node === "character";
                    },
                    command: ({ editor, range, props }: any) => props.command({ editor, range }),
                    items: ({ query }) => {
                        const suggestions = Object.keys(getCharactersData())
                            .filter((name: string) =>
                                name.toLowerCase().startsWith(query.toLowerCase())
                            )
                            .slice(0, 5);

                        return suggestions;
                    },
                    render: () => {
                        return {
                            onStart: (props: SuggestionProps): void => {
                                console.log("start suggestion");
                                return;
                            },
                        };
                    },
                }),
            ];
        },
    });

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

    const editorView = useEditor({
        extensions: [
            // default
            Document,
            Text,
            History,
            CustomBold,
            CustomItalic,
            CustomUnderline,
            ScreenplaySuggestion,

            // scriptio
            Screenplay,
        ],

        // update on each screenplay update
        onUpdate({ editor, transaction }) {
            updateIsSaved(false); // unsaved changes, to prevent data loss between typing and autosave
            deferredSceneUpdate();
            deferredSave();
        },

        // update active on caret update
        onSelectionUpdate({ transaction }) {
            const anchor = (transaction as any).curSelection.$anchor;
            onCaretUpdate(anchor);
        },
    });

    editorView?.setOptions({
        autofocus: "end",
        editorProps: {
            handleKeyDown(view: any, event: any) {
                const selection = view.state.selection;

                if (event.key === "Enter") {
                    const node = selection.$anchor.parent;
                    const nodeSize = node.content.size;
                    const nodePos = selection.$head.parentOffset;
                    const currNode = node.attrs.class;
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

    useEffect(() => {
        if (editorView?.commands) {
            editorView?.commands.setContent(project.screenplay as JSONContent);
            updateEditor(editorView!);
        }
    }, [editorView]);

    // init on editor load
    useEffect(() => {
        if (project.screenplay) {
            computeFullScenesData(project.screenplay);
            computeFullCharactersData(project.screenplay, project.characters);
        }
    }, []);

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

            updateSelectedTab(idx);
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

    const pasteText = (text: string) => {
        editorView?.commands.insertContent(text);
    };

    const replaceOccurrences = (oldWord: string, newWord: string) => {
        editorView?.chain().focus().insertContentAt({ from: 0, to: 4 }, newWord).run();
    };

    const removeCharacter = (name: string) => {
        deleteCharacter(name);
    };

    /* Popup actions */
    const [popup, setPopup] = useState<JSX.Element | null>(null);
    const closePopup = () => {
        updatePopupActive(false);
    };

    const getCharacterOccurrences = (word: string) => {
        return countOccurrences(editorView?.getJSON(), word);
    };

    const editCharacterPopup = (character: CharacterData) => {
        setPopup(() => (
            <PopupCharacterItem
                closePopup={closePopup}
                type={PopupType.EditCharacter}
                character={character}
                getCharacterOccurrences={getCharacterOccurrences}
                replaceOccurrences={replaceOccurrences}
            />
        ));
        updatePopupActive(true);
    };

    const addCharacterPopup = () => {
        setPopup(() => (
            <PopupCharacterItem closePopup={closePopup} type={PopupType.NewCharacter} />
        ));
        updatePopupActive(true);
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
        if (!isSaved) {
            let confirmationMessage = "Are you sure you want to leave?";

            e.returnValue = confirmationMessage;
            return confirmationMessage;
        }

        e.preventDefault();
    };

    useEffect(() => {
        addEventListener("keydown", pressedKeyEvent);
        addEventListener("beforeunload", onUnload);
        addEventListener("charactersDataUpdated", deferredCharactersUpdate);
        return () => {
            removeEventListener("keydown", pressedKeyEvent);
            removeEventListener("beforeunload", onUnload);
            removeEventListener("charactersDataUpdated", deferredCharactersUpdate);
        };
    });

    return (
        <div id="editor-and-sidebar">
            <ContextMenu />
            {isPopupActive && popup}
            <EditorSidebarNavigation
                active={isNavigationActive}
                getFocusOnPosition={getFocusOnPosition}
                selectTextInEditor={selectTextInEditor}
                cutTextSelection={cutTextSelection}
                pasteText={pasteText}
                copyTextSelection={copyTextSelection}
                deferredCharactersUpdate={deferredCharactersUpdate}
                editCharacterPopup={editCharacterPopup}
                addCharacterPopup={addCharacterPopup}
                removeCharacter={removeCharacter}
            />
            <div id="editor-container">
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
