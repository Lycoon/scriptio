"use client";

import { useContext, useEffect, useMemo } from "react";
import { DashboardContext } from "@src/context/DashboardContext";
import { ProjectContext } from "@src/context/ProjectContext";

import CloseSVG from "@public/images/close.svg";

import SidebarMenu, { MenuSection } from "./DashboardSidebar";
import ProjectSettings from "./project/ProjectSettings";
import CollaboratorsSettings from "./project/CollaboratorsSettings";

import styles from "./DashboardModal.module.css";
import ExportProject from "./project/ExportProject";
import { FileDown, Folder, Keyboard, KeyRound, Palette, PanelsTopLeft, User, Users } from "lucide-react";
import KeybindsSettings from "./preferences/KeybindsSettings";
import AppearanceSettings from "./preferences/AppearanceSettings";
import SecuritySettings from "./account/SecuritySettings";
import ProfileSettings from "./account/ProfileSettings";
import LayoutSettings from "./project/LayoutSettings";

const PROJECT_MENU: MenuSection = {
    group: "Project",
    items: [
        {
            id: "General",
            label: "General",
            icon: <Folder size={18} />,
        },
        {
            id: "Layout",
            label: "Layout",
            icon: <PanelsTopLeft size={18} />,
        },
        {
            id: "Export",
            label: "Import/Export",
            icon: <FileDown size={18} />,
        },
        {
            id: "Collaborators",
            label: "Collaborators",
            icon: <Users size={18} />,
        },
    ],
};

const PREFERENCES_MENU: MenuSection = {
    group: "Preferences",
    items: [
        {
            id: "Keybinds",
            label: "Keybinds",
            icon: <Keyboard size={18} />,
        },
        {
            id: "Appearance",
            label: "Appearance",
            icon: <Palette size={18} />,
        },
    ],
};

const ACCOUNT_MENU: MenuSection = {
    group: "Account",
    items: [
        {
            id: "Profile",
            label: "Profile",
            icon: <User size={18} />,
        },
        {
            id: "Security",
            label: "Security",
            icon: <KeyRound size={18} />,
        } /*
        {
            id: "Settings",
            label: "Settings",
            icon: <Settings size={18} />,
        },*/,
    ],
};

const DashboardModal = () => {
    const { isOpen, closeDashboard, activeTab, setActiveTab } = useContext(DashboardContext);
    const { project } = useContext(ProjectContext);

    const isInProject = project !== null;

    // Build menu structure based on whether we're in a project context
    const menuStructure = useMemo<MenuSection[]>(() => {
        if (isInProject) {
            return [PROJECT_MENU, PREFERENCES_MENU, ACCOUNT_MENU];
        }
        return [PREFERENCES_MENU, ACCOUNT_MENU];
    }, [isInProject]);

    // If active tab is a project tab but we're not in a project, switch to first available tab
    useEffect(() => {
        const projectTabIds = PROJECT_MENU.items.map((item) => item.id);
        if (!isInProject && projectTabIds.includes(activeTab)) {
            setActiveTab(PREFERENCES_MENU.items[0].id);
        }
    }, [isInProject, activeTab, setActiveTab]);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeDashboard();
        };
        if (isOpen) window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [isOpen, closeDashboard]);

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={closeDashboard}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <SidebarMenu structure={menuStructure} activeTab={activeTab} onTabChange={setActiveTab} />

                <div className={styles.content}>
                    <header className={styles.contentHeader}>
                        <h3>{activeTab}</h3>
                        <CloseSVG className={styles.close_btn} onClick={closeDashboard} />
                    </header>

                    <div className={styles.scrollArea}>
                        {/* Project tabs - only rendered when in project context */}
                        {isInProject && activeTab === "General" && <ProjectSettings />}
                        {isInProject && activeTab === "Layout" && <LayoutSettings />}
                        {isInProject && activeTab === "Export" && <ExportProject />}
                        {isInProject && activeTab === "Collaborators" && <CollaboratorsSettings />}
                        {/* Preferences tabs */}
                        {activeTab === "Keybinds" && <KeybindsSettings />}
                        {activeTab === "Appearance" && <AppearanceSettings />}
                        {/* Account tabs */}
                        {activeTab === "Profile" && <ProfileSettings />}
                        {activeTab === "Security" && <SecuritySettings />}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardModal;
