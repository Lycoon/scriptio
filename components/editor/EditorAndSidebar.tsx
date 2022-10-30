import { JSONContent, useEditor } from "@tiptap/react";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "../../src/context/UserContext";
import {
    CustomBold,
    CustomItalic,
    CustomUnderline,
    Screenplay,
} from "../../src/Screenplay";
import EditorComponent from "./EditorComponent";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";
import { Project } from "../../pages/api/users";
import { saveScreenplay } from "../../src/lib/requests";
import { useDebouncedCallback } from "use-debounce";
import {
    computeFullScenesData,
    getScenesData,
} from "../../src/lib/screenplayUtils";
import EditorSidebarFormat from "./sidebar/EditorSidebarFormat";
import EditorSidebarNavigation from "./sidebar/EditorSidebarNavigation";
import ContextMenu from "./sidebar/ContextMenu";

type Props = {
    project: Project;
};

const EditorAndSidebar = ({ project }: Props) => {
    const { updateEditor, updateIsSaving } = useContext(UserContext);
    const [selectedTab, updateSelectedTab] = useState<number>(0);
    const [isSaved, updateIsSaved] = useState<boolean>(false);
    const [isNavigationActive, updateIsNavigationActive] =
        useState<boolean>(false);

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

            // scriptio
            Screenplay,
        ],

        // update on each screenplay change
        onUpdate({ editor, transaction }) {
            updateIsSaved(false); // to prevent data loss between typing and autosave
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
                                break;
                            case "dialogue":
                                newNode = "character";
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
        editorView?.commands.setContent(project.screenplay as JSONContent);
        updateEditor(editorView!);
    }, [editorView]);

    useEffect(() => {
        if (project.screenplay) {
            computeFullScenesData(project.screenplay);
        }
    }, []);

    const setActiveTab = (node: string) => {
        updateSelectedTab(tabs.indexOf(node));

        if (editorView)
            editorView
                .chain()
                .focus()
                .setNode("Screenplay", { class: node })
                .run();
    };

    const pressedKeyEvent = (e: KeyboardEvent) => {
        if (e.key === "Tab") {
            e.preventDefault();

            const idx = (selectedTab + 1) % 8;
            updateSelectedTab(idx);
            setActiveTab(tabs[idx]);
        }

        if (e.ctrlKey && e.key === "s") {
            e.preventDefault();
            save();
        }

        if (e.altKey && e.key === "w") {
            e.preventDefault();
            updateIsNavigationActive(!isNavigationActive);
        }
    };

    const getFocusOnPosition = (position: number) => {
        editorView?.commands.focus(position);
    };

    const selectTextInEditor = (start: number, end: number) => {
        editorView
            ?.chain()
            .focus(start)
            .setTextSelection({ from: start, to: end })
            .run();
    };

    const cutTextSelection = (start: number, end: number) => {
        //editorView?.state.doc.cut(start, end);
        editorView?.commands.deleteRange({ from: start, to: end });
    };

    const copyTextSelection = (start: number, end: number) => {
        editorView?.state.doc.copy();
    };

    const pasteText = (text: string) => {
        editorView?.commands.insertContent(text);
    };

    const replaceOccurrences = (text: string, replace: string) => {
        const len = replace.length;

        editorView
            ?.chain()
            .focus()
            .insertContentAt({ from: 0, to: 0 }, text)
            .run();
    };

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
        addEventListener("keydown", pressedKeyEvent, false);
        addEventListener("beforeunload", onUnload);
        return () => {
            removeEventListener("keydown", pressedKeyEvent, false);
            removeEventListener("beforeunload", onUnload);
        };
    });

    return (
        <div id="editor-and-sidebar">
            <ContextMenu />
            <EditorSidebarNavigation
                active={isNavigationActive}
                getFocusOnPosition={getFocusOnPosition}
                selectTextInEditor={selectTextInEditor}
                cutTextSelection={cutTextSelection}
                pasteText={pasteText}
                replaceOccurrences={replaceOccurrences}
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
