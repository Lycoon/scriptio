import { Editor } from "@tiptap/react";
import { createContext, ReactNode, useState } from "react";
import { ContextMenuProps } from "@components/editor/sidebar/ContextMenu";
import { Project } from "@prisma/client";
import { SaveStatus } from "../lib/utils/enums";

export type contextType = {
    editor: Editor | undefined;
    updateEditor: (editor: Editor) => void;
    darkMode: boolean;
    updateDarkMode: (darkMode: boolean) => void;
    saveStatus: SaveStatus;
    updateSaveStatus: (saveStatus: SaveStatus) => void;
    project: Project | undefined;
    updateProject: (project: Project | undefined) => void;
    contextMenu: ContextMenuProps | undefined;
    updateContextMenu: (contextMenu: ContextMenuProps | undefined) => void;
    popup: any;
    updatePopup: (popup: any) => void;
    isDesktop: boolean;
    updateIsDesktop: (isDesktop: boolean) => void;
};

const contextDefaults: contextType = {
    editor: undefined,
    updateEditor: () => {},
    darkMode: false,
    updateDarkMode: () => {},
    saveStatus: SaveStatus.SAVED,
    updateSaveStatus: () => {},
    project: undefined,
    updateProject: () => {},
    contextMenu: undefined,
    updateContextMenu: () => {},
    popup: undefined,
    updatePopup: () => {},
    isDesktop: false,
    updateIsDesktop: () => {},
};

type Props = {
    children: ReactNode;
};

export const UserContext = createContext<contextType>(contextDefaults);

export function UserContextProvider({ children }: Props) {
    const [editor, setEditor] = useState<Editor | undefined>(undefined);
    const [darkMode, setDarkMode] = useState<boolean>(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>(SaveStatus.SAVED);
    const [project, setProject] = useState<Project | undefined>(undefined);
    const [contextMenu, setContextMenu] = useState<ContextMenuProps | undefined>(undefined);
    const [popup, setPopup] = useState<any>(undefined);
    const [isDesktop, setIsDesktop] = useState<boolean>(false);

    const updateEditor = (editor_: Editor) => {
        setEditor(editor_);
    };

    const updateDarkMode = (darkMode_: boolean) => {
        setDarkMode(darkMode_);
    };

    const updateSaveStatus = (saveStatus_: SaveStatus) => {
        setSaveStatus(saveStatus_);
    };

    const updateProject = (project_: Project | undefined) => {
        setProject(project_);
    };

    const updateContextMenu = (contextMenu_: ContextMenuProps | undefined) => {
        setContextMenu(contextMenu_);
    };

    const updatePopup = (popup_: any) => {
        setPopup(popup_);
    };

    const updateIsDesktop = (isDesktop_: boolean) => {
        setIsDesktop(isDesktop_);
    };

    const value = {
        editor,
        updateEditor,
        darkMode,
        updateDarkMode,
        saveStatus,
        updateSaveStatus,
        project,
        updateProject,
        contextMenu,
        updateContextMenu,
        popup,
        updatePopup,
        isDesktop,
        updateIsDesktop,
    };

    return (
        <>
            <UserContext.Provider value={value}>{children}</UserContext.Provider>
        </>
    );
}
