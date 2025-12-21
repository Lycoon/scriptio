import { Category } from "@components/dashboard/DashboardSidebar";
import { createContext, ReactNode, useState } from "react";
// Import the type from your Sidebar componen

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

    const openDashboard = (tab?: Category) => {
        if (tab) {
            setActiveTab(tab);
        }
        setIsOpen(true);
    };

    const closeDashboard = () => setIsOpen(false);

    const value = {
        isOpen,
        activeTab,
        openDashboard,
        closeDashboard,
        setActiveTab,
    };

    return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export const DashboardContext = createContext<DashboardContextType>(contextDefaults);
