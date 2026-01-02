import { useContext, useEffect, useState } from "react";
import { DashboardContext } from "@src/context/DashboardContext";

import CloseSVG from "@public/images/close.svg";

import SidebarMenu, { MenuSection } from "./DashboardSidebar";
import ProjectSettings from "./project/ProjectSettings";
import CollaboratorsSettings from "./project/CollaboratorsSettings";

import styles from "./DashboardModal.module.css";
import ExportProject from "./project/ExportProject";
import { Download, Folder, Keyboard, KeyRound, Palette, Settings, User, Users } from "lucide-react";
import KeybindsSettings from "./preferences/KeybindsSettings";
import AppearanceSettings from "./preferences/AppearanceSettings";

const MENU_STRUCTURE: MenuSection[] = [
    {
        group: "Project",
        items: [
            {
                id: "General",
                label: "General",
                icon: <Folder size={18} />,
            },
            {
                id: "Export",
                label: "Export",
                icon: <Download size={18} />,
            },
            {
                id: "Collaborators",
                label: "Collaborators",
                icon: <Users size={18} />,
            },
        ],
    },
    {
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
            }
        ]
    },
    {
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
            },
            {
                id: "Settings",
                label: "Settings",
                icon: <Settings size={18} />,
            },
        ],
    },
];

const DashboardModal = () => {
    const { isOpen, closeDashboard, activeTab, setActiveTab } = useContext(DashboardContext);

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
                <SidebarMenu structure={MENU_STRUCTURE} activeTab={activeTab} onTabChange={setActiveTab} />

                <main className={styles.content}>
                    <header className={styles.contentHeader}>
                        <h3>{activeTab}</h3>
                        <CloseSVG className={styles.close_btn} onClick={closeDashboard} />
                    </header>

                    <div className={styles.scrollArea}>
                        {activeTab === "General" && <ProjectSettings />}
                        {activeTab === "Export" && <ExportProject />}
                        {activeTab === "Collaborators" && <CollaboratorsSettings />}
                        {activeTab === "Profile" && <ProfileSettings />}
                        {activeTab === "Keybinds" && <KeybindsSettings />}
                        {activeTab === "Appearance" && <AppearanceSettings />}
                        {/* Others... */}
                    </div>
                </main>
            </div>
        </div>
    );
};

const ProfileSettings = () => (
    <div className={styles.formGroup}>
        <label>Display Name</label>
        <input type="text" placeholder="Your Name" className={styles.input} />
    </div>
);

export default DashboardModal;
