import { useContext, useEffect, useState } from "react";
import { DashboardContext } from "@src/context/DashboardContext";

import CloseSVG from "@public/images/close.svg";
import ProfileSVG from "@public/images/profile.svg";
import ExportSVG from "@public/images/export.svg";
import GearSVG from "@public/images/gear.svg";
import LockSVG from "@public/images/lock.svg";
import TeamSVG from "@public/images/team.svg";
import FolderSVG from "@public/images/folder.svg";

import SidebarMenu, { Category, MenuSection } from "./DashboardSidebar";
import ProjectSettings from "./project/ProjectSettings";
import CollaboratorsSettings from "./project/CollaboratorsSettings";

import styles from "./DashboardModal.module.css";

const MENU_STRUCTURE: MenuSection[] = [
    {
        group: "Project",
        items: [
            {
                id: "General",
                label: "General",
                icon: <FolderSVG />,
            },
            {
                id: "Export",
                label: "Export",
                icon: <ExportSVG />,
            },
            {
                id: "Collaborators",
                label: "Collaborators",
                icon: <TeamSVG />,
            },
        ],
    },
    {
        group: "Account",
        items: [
            {
                id: "Profile",
                label: "Profile",
                icon: <ProfileSVG />,
            },
            {
                id: "Security",
                label: "Security",
                icon: <LockSVG />,
            },
            {
                id: "Settings",
                label: "Settings",
                icon: <GearSVG />,
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
                        {activeTab === "Collaborators" && <CollaboratorsSettings />}
                        {activeTab === "Profile" && <ProfileSettings />}
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
