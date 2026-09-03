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
    /**
     * Phone: on a project the burger menu *is* the dashboard's sections list, and
     * it occupies the exact same drawer rect as the dashboard itself. Picking a
     * section closes the one and opens the other, and doing both halves in a single
     * action puts them in the same commit — so the outgoing drawer's slide-out and
     * the incoming one's slide-in play together as one swipe instead of in
     * sequence. The home dashboard replays the same slide on its own screen change
     * (see [DashboardModal]), so switching sections looks the same in both places.
     */
    swapDrawerScreen: (to: "dashboard" | "menu", tab?: Category) => void;
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
    swapDrawerScreen: () => {},
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

    // Both halves of the swap in one action so they land in the same commit: the
    // drawer that leaves starts sliding out on the very frame the one that arrives
    // starts sliding in, which is what makes the pair read as a single swipe.
    const swapDrawerScreen = useCallback((to: "dashboard" | "menu", tab?: Category) => {
        if (to === "dashboard") {
            if (tab) setActiveTab(tab);
            setOpenedFromMenu(true);
            setMobileMenuOpen(false);
            setIsOpen(true);
        } else {
            setIsOpen(false);
            setMobileMenuOpen(true);
        }
    }, []);

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
            swapDrawerScreen,
        }),
        [
            isOpen,
            activeTab,
            openDashboard,
            closeDashboard,
            openedFromMenu,
            mobileMenuOpen,
            swapDrawerScreen,
        ]
    );

    return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export const DashboardContext = createContext<DashboardContextType>(contextDefaults);
