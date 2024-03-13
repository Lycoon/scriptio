import { createContext, ReactNode, useState } from "react";
import { ContextMenuProps } from "@components/editor/sidebar/ContextMenu";
import { PopupData, PopupUnionData } from "@src/lib/editor/popup";

export type UserContextType = {
    isDarkMode: boolean;
    updateDarkMode: (isDarkMode: boolean) => void;
    isZenMode: boolean;
    updateZenMode: (isZenMode: boolean) => void;
    contextMenu: ContextMenuProps | undefined;
    updateContextMenu: (contextMenu: ContextMenuProps | undefined) => void;
    popup: PopupData<PopupUnionData> | undefined;
    updatePopup: (popup: PopupData<PopupUnionData> | undefined) => void;
    isDesktop: boolean;
    updateIsDesktop: (isDesktop: boolean) => void;
};

const contextDefaults: UserContextType = {
    isDarkMode: false,
    updateDarkMode: () => {},
    isZenMode: false,
    updateZenMode: () => {},
    contextMenu: undefined,
    updateContextMenu: () => {},
    popup: undefined,
    updatePopup: () => {},
    isDesktop: false,
    updateIsDesktop: () => {},
};

type UserContextProps = {
    children: ReactNode;
};

export const UserContext = createContext<UserContextType>(contextDefaults);

export function UserContextProvider({ children }: UserContextProps) {
    const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
    const [isZenMode, setIsZenMode] = useState<boolean>(false);
    const [contextMenu, setContextMenu] = useState<ContextMenuProps | undefined>(undefined);
    const [popup, setPopup] = useState<PopupData<PopupUnionData> | undefined>(undefined);
    const [isDesktop, setIsDesktop] = useState<boolean>(false);

    const updateDarkMode = (isDarkMode_: boolean) => {
        setIsDarkMode(isDarkMode_);
    };

    const updateZenMode = (isZenMode_: boolean) => {
        setIsZenMode(isZenMode_);
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
        isDarkMode,
        updateDarkMode,
        isZenMode,
        updateZenMode,
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
