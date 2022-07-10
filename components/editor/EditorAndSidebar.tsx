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
import EditorSidebar from "./EditorSidebar";

import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";
import { Project } from "../../pages/api/users";
import { editProject } from "../../src/lib/requests";

type Props = {
    project: Project;
};

const EditorAndSidebar = ({ project }: Props) => {
    const { editor, updateEditor } = useContext(UserContext);
    const [selectedTab, updateSelectedTab] = useState<number>(0);
    const [notSaved, updateNotSaved] = useState<boolean>(false);
    const [isSaving, updateIsSaving] = useState<boolean>(false);
    const [isBold, setIsBold] = useState<boolean>(false);
    const [isItalic, setIsItalic] = useState<boolean>(false);
    const [isUnderline, setIsUnderline] = useState<boolean>(false);

    const updateEditorStyles = (marks: any[]) => {
        marks = marks.map((mark: any) => mark.attrs.class);

        setIsBold(marks.includes("bold"));
        setIsItalic(marks.includes("italic"));
        setIsUnderline(marks.includes("underline"));
    };

    const tabs = [
        "scene",
        "action",
        "character",
        "dialogue",
        "parenthetical",
        "transition",
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

        onUpdate() {
            updateNotSaved(true);
        },

        // update active on caret update
        onSelectionUpdate({ transaction }) {
            const anchor = (transaction as any).curSelection.$anchor;
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
        },
    });

    editorView?.setOptions({
        editorProps: {
            handleKeyDown(view: any, event: any) {
                const selection = view.state.selection;

                if (event.key === "Enter") {
                    const node = selection.$anchor.parent;
                    const nodeSize = node.content.size;
                    const nodePos = selection.$head.parentOffset;
                    const currNode = node.attrs.class;
                    const pos = selection.anchor;

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

    const setActiveTab = (node: string) => {
        updateSelectedTab(tabs.indexOf(node));

        if (editorView)
            editorView
                .chain()
                .focus()
                .setNode("Screenplay", { class: node })
                .run();
    };

    const tabKeyPressed = (e: KeyboardEvent) => {
        if (e.key === "Tab") {
            e.preventDefault();

            const idx = (selectedTab + 1) % 6;
            updateSelectedTab(idx);
            setActiveTab(tabs[idx]);
        }
    };

    const saveKeyPressed = async (e: KeyboardEvent) => {
        if (e.ctrlKey && e.key === "s") {
            e.preventDefault();

            const body = {
                projectId: project.id,
                screenplay: editorView?.getJSON(),
            };

            updateIsSaving(true);
            await editProject(project.userId, body);
            updateIsSaving(false);
            updateNotSaved(false);
        }
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
        if (notSaved) {
            let confirmationMessage = "Are you sure you want to leave?";

            e.returnValue = confirmationMessage;
            return confirmationMessage;
        }

        e.preventDefault();
    };

    useEffect(() => {
        addEventListener("keydown", tabKeyPressed, false);
        addEventListener("keydown", saveKeyPressed, false);
        addEventListener("beforeunload", onUnload);
        return () => {
            removeEventListener("keydown", tabKeyPressed, false);
            removeEventListener("keydown", saveKeyPressed, false);
            removeEventListener("beforeunload", onUnload);
        };
    });

    return (
        <div id="editor-and-sidebar">
            <div id="editor-container">
                <EditorComponent editor={editorView} />
            </div>
            <EditorSidebar
                tabs={tabs}
                toggleBold={toggleBold}
                toggleItalic={toggleItalic}
                toggleUnderline={toggleUnderline}
                isBold={isBold}
                isItalic={isItalic}
                isUnderline={isUnderline}
                selectedTab={selectedTab}
                setActiveTab={setActiveTab}
                isSaving={isSaving}
            />
        </div>
    );
};

export default EditorAndSidebar;
