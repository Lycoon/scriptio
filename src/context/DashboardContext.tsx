"use client";

import { Category } from "@components/dashboard/DashboardSidebar";
import { createContext, ReactNode, useCallback, useMemo, useState } from "react";

export type DashboardContextType = {
    isOpen: boolean;
    activeTab: Category;
    openDashboard: (tab?: Category) => void;
    closeDashboard: () => void;
    setActiveTab: (tab: Category) => void;
};

const contextDefaults: DashboardContextType = {
    isOpen: false,
    activeTab: "General",
    openDashboard: () => {},
    closeDashboard: () => {},
    setActiveTab: () => {},
};

export function DashboardContextProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState<Category>("General");

    const openDashboard = useCallback((tab?: Category) => {
        if (tab) {
            setActiveTab(tab);
        }
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
        }),
        [isOpen, activeTab, openDashboard, closeDashboard]
    );

    return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export const DashboardContext = createContext<DashboardContextType>(contextDefaults);
