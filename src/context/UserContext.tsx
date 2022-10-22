import { Editor, useEditor } from "@tiptap/react";
import { createContext, ReactNode, useEffect, useState } from "react";
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

    const updateProject = (project_: Project) => {
        setProject(project_);
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
    };

    return (
        <>
            <UserContext.Provider value={value}>
                {children}
            </UserContext.Provider>
        </>
    );
}
