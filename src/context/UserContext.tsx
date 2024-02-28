import { Editor } from "@tiptap/react";
import { createContext, ReactNode, useState } from "react";
import { ContextMenuProps } from "@components/editor/sidebar/ContextMenu";
import { PopupData, PopupUnionData } from "@src/lib/editor/popup";

export type UserContextType = {
    editor: Editor | undefined;
    updateEditor: (editor: Editor) => void;
    darkMode: boolean;
    updateDarkMode: (darkMode: boolean) => void;
    contextMenu: ContextMenuProps | undefined;
    updateContextMenu: (contextMenu: ContextMenuProps | undefined) => void;
    popup: PopupData<PopupUnionData> | undefined;
    updatePopup: (popup: PopupData<PopupUnionData> | undefined) => void;
    isDesktop: boolean;
    updateIsDesktop: (isDesktop: boolean) => void;
};

const contextDefaults: UserContextType = {
    editor: undefined,
    updateEditor: () => {},
    darkMode: false,
    updateDarkMode: () => {},
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

export const UserContext = createContext<UserContextType>(contextDefaults);

export function UserContextProvider({ children }: Props) {
    const [editor, setEditor] = useState<Editor | undefined>(undefined);
    const [darkMode, setDarkMode] = useState<boolean>(false);
    const [contextMenu, setContextMenu] = useState<ContextMenuProps | undefined>(undefined);
    const [popup, setPopup] = useState<PopupData<PopupUnionData> | undefined>(undefined);
    const [isDesktop, setIsDesktop] = useState<boolean>(false);

    const updateEditor = (editor_: Editor) => {
        setEditor(editor_);
    };

    const updateDarkMode = (darkMode_: boolean) => {
        setDarkMode(darkMode_);
    };

    const updateContextMenu = (contextMenu_: ContextMenuProps | undefined) => {
        setContextMenu(contextMenu_);
    };

    const updatePopup = (popup_: PopupData<PopupUnionData> | undefined) => {
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
