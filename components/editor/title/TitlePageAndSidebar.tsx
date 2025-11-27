/* Components */
import TitlePageSidebar from "./TitlePageSidebar";
import { EditorContent } from "@tiptap/react";
import { Popup } from "@components/popup/Popup";

/* Utils */
import { ProjectContext } from "@src/context/ProjectContext";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "@src/context/UserContext";
import { SaveStatus, ScreenplayElement, Style, TitlePageElement } from "@src/lib/utils/enums";
import { Project } from "@src/lib/utils/types";

/* Styles */
import styles from "./TitlePageAndSidebar.module.css";
import editor_ from "../screenplay/Screenplay.module.css";
import { applyElement, insertElement, useTitlePageEditor } from "@src/lib/editor/editor";
import TitlePageEditor from "./TitlePageEditor";

type TitlePageAndSidebarProps = {
    project: Project;
};

const TitlePageAndSidebar = ({ project }: TitlePageAndSidebarProps) => {
    const userCtx = useContext(UserContext);
    const projectCtx = useContext(ProjectContext);

    const [selectedStyles, setSelectedStyles] = useState<Style>(Style.None);
    const [selectedElement, setSelectedElement] = useState<TitlePageElement>(TitlePageElement.Other);

    const setActiveElement = (element: TitlePageElement, applyStyle = true) => {
        setSelectedElement(element);
        if (applyStyle && titleEditor) applyElement(titleEditor, element);
    };

    const titleEditor = useTitlePageEditor(project.titlePage, setActiveElement, setSelectedStyles);

    titleEditor?.setOptions({
        autofocus: "end",
        editorProps: {
            handleKeyDown(view: any, event: any) {
                const selection = view.state.selection;
                const node = selection.$anchor.parent;
                const nodeSize = node.content.size;
                const nodePos = selection.$head.parentOffset;
                const currNode = node.attrs.class as ScreenplayElement;

                if (event.key === "Enter") {
                    // empty element
                    if (nodeSize === 0) {
                        setActiveElement(TitlePageElement.Other);
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

                    insertElement(titleEditor, newNode, selection.anchor);
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

            switch (
                selectedElement
                /*
                case ScreenplayElement.Action:
                    setActiveElement(ScreenplayElement.Character);
                    break;
                    */
            ) {
            }
        }
    };

    const onUnload = () => {
        if (projectCtx.saveStatus === SaveStatus.Saving) {
            let confirmationMessage = "Are you sure you want to leave?";
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

    return (
        <div className={styles.container}>
            <Popup />
            <div className={styles.title_page}>
                <TitlePageEditor editor={titleEditor} />
            </div>
            <TitlePageSidebar
                selectedStyles={selectedStyles}
                setActiveStyles={setSelectedStyles}
                selectedElement={selectedElement}
                setActiveElement={setActiveElement}
            />
        </div>
    );
};

export default TitlePageAndSidebar;
