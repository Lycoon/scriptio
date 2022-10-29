import { Editor } from "@tiptap/react";
import { createContext, ReactNode, useState } from "react";
import { ContextMenuProps } from "../../components/editor/sidebar/ContextMenu";
import { CookieUser, Project } from "../../pages/api/users";
import useUser from "../lib/useUser";

export type contextType = {
    user: CookieUser | undefined;
    updateUser: (user: CookieUser | undefined) => void;
    editor: Editor | undefined;
    updateEditor: (editor: Editor) => void;
    darkMode: boolean;
    updateDarkMode: (darkMode: boolean) => void;
    saved: boolean;
    updateSaved: (saved: boolean) => void;
    project: Project | undefined;
    updateProject: (project: Project | undefined) => void;
    isSaving: boolean;
    updateIsSaving: (isSaving: boolean) => void;
    contextMenu: ContextMenuProps | undefined;
    updateContextMenu: (contextMenu: ContextMenuProps | undefined) => void;
};

const contextDefaults: contextType = {
    user: undefined,
    updateUser: () => {},
    editor: undefined,
    updateEditor: () => {},
    darkMode: false,
    updateDarkMode: () => {},
    saved: true,
    updateSaved: () => {},
    project: undefined,
    updateProject: () => {},
    isSaving: false,
    updateIsSaving: () => {},
    contextMenu: undefined,
    updateContextMenu: () => {},
};

type Props = {
    children: ReactNode;
};

export const UserContext = createContext<contextType>(contextDefaults);

export function ContextProvider({ children }: Props) {
    const { user, setUser } = useUser();
    const [editor, setEditor] = useState<Editor | undefined>(undefined);
    const [darkMode, setDarkMode] = useState<boolean>(false);
    const [saved, setSaved] = useState<boolean>(true);
    const [project, setProject] = useState<Project | undefined>(undefined);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [contextMenu, setContextMenu] = useState<
        ContextMenuProps | undefined
    >(undefined);

    const updateUser = (user_: CookieUser | undefined) => {
        setUser(user_);
    };

    const updateEditor = (editor_: Editor) => {
        setEditor(editor_);
    };

    const updateDarkMode = (darkMode_: boolean) => {
        setDarkMode(darkMode_);
    };

    const updateSaved = (saved_: boolean) => {
        setSaved(saved_);
    };

    const updateProject = (project_: Project | undefined) => {
        setProject(project_);
    };

    const updateIsSaving = (isSaving_: boolean) => {
        setIsSaving(isSaving_);
    };

    const updateContextMenu = (contextMenu_: ContextMenuProps | undefined) => {
        setContextMenu(contextMenu_);
    };

    const value = {
        user,
        updateUser,
        editor,
        updateEditor,
        darkMode,
        updateDarkMode,
        saved,
        updateSaved,
        project,
        updateProject,
        isSaving,
        updateIsSaving,
        contextMenu,
        updateContextMenu,
    };

    return (
        <>
            <UserContext.Provider value={value}>
                {children}
            </UserContext.Provider>
        </>
    );
}
