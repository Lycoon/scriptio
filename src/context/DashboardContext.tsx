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
     * it occupies the exact same drawer rect as the dashboard itself. Swapping one
     * for the other is therefore a screen change inside a single drawer, not two
     * drawers opening and closing — this action performs both halves at once so
     * neither plays its slide (see {@link drawerSwap}), matching the home
     * dashboard, where the sections list and a section swap in place.
     */
    swapDrawerScreen: (to: "dashboard" | "menu", tab?: Category) => void;
    /**
     * True while the burger menu and the dashboard are mid-swap, i.e. the drawer
     * on screen is changing its content rather than opening or closing. Both
     * drawers suppress their slide animation while it's set. Any other way of
     * opening or closing either one clears it, so a plain burger tap still slides.
     */
    drawerSwap: boolean;
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
    drawerSwap: false,
};

export function DashboardContextProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState<Category>("General");
    const [openedFromMenu, setOpenedFromMenu] = useState<boolean>(false);
    const [mobileMenuOpen, setMobileMenuOpenState] = useState<boolean>(false);
    const [drawerSwap, setDrawerSwap] = useState<boolean>(false);

    const openDashboard = useCallback((tab?: Category, opts?: { fromMenu?: boolean }) => {
        if (tab) {
            setActiveTab(tab);
        }
        setOpenedFromMenu(!!opts?.fromMenu);
        setDrawerSwap(false);
        setIsOpen(true);
    }, []);

    const closeDashboard = useCallback(() => {
        setDrawerSwap(false);
        setIsOpen(false);
    }, []);

    // Opening or closing the menu on its own (burger tap, close button, backdrop)
    // is a real drawer transition, so it clears the swap flag and slides.
    const setMobileMenuOpen = useCallback((value: boolean) => {
        setDrawerSwap(false);
        setMobileMenuOpenState(value);
    }, []);

    // Both halves of the swap in one action, so the flag can't be clobbered by the
    // ordering of two separate calls: the drawer that leaves and the one that
    // arrives are committed together, with drawerSwap set for that same render.
    const swapDrawerScreen = useCallback((to: "dashboard" | "menu", tab?: Category) => {
        setDrawerSwap(true);
        if (to === "dashboard") {
            if (tab) setActiveTab(tab);
            setOpenedFromMenu(true);
            setMobileMenuOpenState(false);
            setIsOpen(true);
        } else {
            setIsOpen(false);
            setMobileMenuOpenState(true);
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
            drawerSwap,
        }),
        [
            isOpen,
            activeTab,
            openDashboard,
            closeDashboard,
            openedFromMenu,
            mobileMenuOpen,
            setMobileMenuOpen,
            swapDrawerScreen,
            drawerSwap,
        ]
    );

    return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export const DashboardContext = createContext<DashboardContextType>(contextDefaults);
