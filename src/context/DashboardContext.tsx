"use client";

import { Category } from "@components/dashboard/DashboardSidebar";
import { createContext, ReactNode, useCallback, useMemo, useState } from "react";

export type DashboardContextType = {
    isOpen: boolean;
    activeTab: Category;
    openDashboard: (tab?: Category, opts?: { fromMenu?: boolean }) => void;
    closeDashboard: () => void;
    setActiveTab: (tab: Category) => void;
    /**
     * Phone: whether the open dashboard was launched from the navbar burger menu.
     * When true the dashboard shows a back arrow that returns to that menu (the
     * "mobile dashboard") instead of just closing.
     */
    openedFromMenu: boolean;
    /**
     * Phone: the navbar burger menu's open state, lifted here so the dashboard's
     * back arrow can reopen the menu it was launched from. Owned by
     * [ProjectNavbarMobile]'s burger, read by both it and [DashboardModal].
     */
    mobileMenuOpen: boolean;
    setMobileMenuOpen: (value: boolean) => void;
};

const contextDefaults: DashboardContextType = {
    isOpen: false,
    activeTab: "General",
    openDashboard: () => {},
    closeDashboard: () => {},
    setActiveTab: () => {},
    openedFromMenu: false,
    mobileMenuOpen: false,
    setMobileMenuOpen: () => {},
};

export function DashboardContextProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState<Category>("General");
    const [openedFromMenu, setOpenedFromMenu] = useState<boolean>(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

    const openDashboard = useCallback((tab?: Category, opts?: { fromMenu?: boolean }) => {
        if (tab) {
            setActiveTab(tab);
        }
        setOpenedFromMenu(!!opts?.fromMenu);
        setIsOpen(true);
    }, []);

    const closeDashboard = useCallback(() => setIsOpen(false), []);

    const value = useMemo(
        () => ({
            isOpen,
            activeTab,
            openDashboard,
            closeDashboard,
            setActiveTab,
            openedFromMenu,
            mobileMenuOpen,
            setMobileMenuOpen,
        }),
        [isOpen, activeTab, openDashboard, closeDashboard, openedFromMenu, mobileMenuOpen]
    );

    return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export const DashboardContext = createContext<DashboardContextType>(contextDefaults);
