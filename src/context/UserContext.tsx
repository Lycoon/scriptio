"use client";

import { createContext, Dispatch, ReactNode, SetStateAction, useState } from "react";
import { ContextMenuProps } from "@components/editor/sidebar/ContextMenu";
import { PopupData, PopupUnionData } from "@src/lib/screenplay/popup";
import { UserTheme } from "@src/lib/utils/types";

export type UserContextType = {
    theme: UserTheme;
    updateTheme: (theme: UserTheme) => void;
    isZenMode: boolean;
    updateIsZenMode: Dispatch<SetStateAction<boolean>>;
    contextMenu: ContextMenuProps | undefined;
    updateContextMenu: (contextMenu: ContextMenuProps | undefined) => void;
    popup: PopupData<PopupUnionData> | undefined;
    updatePopup: (popup: PopupData<PopupUnionData> | undefined) => void;
    isDesktop: boolean;
    updateIsDesktop: (isDesktop: boolean) => void;
};

const contextDefaults: UserContextType = {
    theme: "dark",
    updateTheme: () => {},
    isZenMode: false,
    updateIsZenMode: () => {},
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
    const [theme, updateTheme] = useState<UserTheme>("dark");
    const [isZenMode, updateIsZenMode] = useState<boolean>(false);
    const [contextMenu, updateContextMenu] = useState<ContextMenuProps | undefined>(undefined);
    const [popup, updatePopup] = useState<PopupData<PopupUnionData> | undefined>(undefined);
    const [isDesktop, updateIsDesktop] = useState<boolean>(false);

    const value = {
        theme,
        updateTheme,
        isZenMode,
        updateIsZenMode,
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
