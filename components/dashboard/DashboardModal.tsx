"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { DashboardContext } from "@src/context/DashboardContext";
import { ProjectContext } from "@src/context/ProjectContext";
import { useCookieUser } from "@src/lib/utils/hooks";

import CloseSVG from "@public/images/close.svg";

import SidebarMenu, { MenuSection } from "./DashboardSidebar";
import ProjectSettings from "./project/ProjectSettings";
import CollaboratorsSettings from "./project/CollaboratorsSettings";

import styles from "./DashboardModal.module.css";
import ExportProject from "./project/ExportProject";
import { FileDown, Folder, Globe, Keyboard, KeyRound, Palette, PanelsTopLeft, User, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import KeybindsSettings from "./preferences/KeybindsSettings";
import AppearanceSettings from "./preferences/AppearanceSettings";
import LanguageSettings from "./preferences/LanguageSettings";
import SecuritySettings from "./account/SecuritySettings";
import ProfileSettings from "./account/ProfileSettings";
import LayoutSettings from "./project/LayoutSettings";
import DashboardLogin from "./account/DashboardLogin";
import AboutSettings from "./AboutSettings";

const DashboardModal = () => {
    const { isOpen, closeDashboard, activeTab, setActiveTab } = useContext(DashboardContext);
    const { project, isYjsReady } = useContext(ProjectContext);
    const { user } = useCookieUser();
    const t = useTranslations("modal");

    const PROJECT_MENU = useMemo<MenuSection>(() => ({
        group: t("groups.project"),
        items: [
            { id: "General",       label: t("tabs.General"),       icon: <Folder size={18} /> },
            { id: "Layout",        label: t("tabs.Layout"),        icon: <PanelsTopLeft size={18} /> },
            { id: "Export",        label: t("tabs.Export"),        icon: <FileDown size={18} /> },
            { id: "Collaborators", label: t("tabs.Collaborators"), icon: <Users size={18} /> },
        ],
    }), [t]);

    const PREFERENCES_MENU = useMemo<MenuSection>(() => ({
        group: t("groups.preferences"),
        items: [
            { id: "Keybinds",   label: t("tabs.Keybinds"),   icon: <Keyboard size={18} /> },
            { id: "Appearance", label: t("tabs.Appearance"), icon: <Palette size={18} /> },
            { id: "Language",   label: t("tabs.Language"),   icon: <Globe size={18} /> },
        ],
    }), [t]);

    const ACCOUNT_MENU = useMemo<MenuSection>(() => ({
        group: t("groups.account"),
        items: [
            { id: "Profile",   label: t("tabs.Profile"),   icon: <User size={18} /> },
            { id: "Security",  label: t("tabs.Security"),  icon: <KeyRound size={18} /> },
        ],
    }), [t]);

    // We're in a project if either:
    // - We have API membership data (cloud project), OR
    // - Yjs is ready (local project on desktop without auth)
    const isInProject = project !== null || isYjsReady;
    const isSignedIn = !!user;
    const [dangerOpen, setDangerOpen] = useState(false);

    // Build menu structure based on whether we're in a project context and signed in
    const menuStructure = useMemo<MenuSection[]>(() => {
        const sections: MenuSection[] = [];
        if (isInProject) sections.push(PROJECT_MENU);
        sections.push(PREFERENCES_MENU);
        if (isSignedIn) sections.push(ACCOUNT_MENU);
        return sections;
    }, [isInProject, isSignedIn, PROJECT_MENU, PREFERENCES_MENU, ACCOUNT_MENU]);

    // If active tab is a project tab but we're not in a project, or an account tab but not signed in, switch to first available tab
    useEffect(() => {
        const projectTabIds = PROJECT_MENU.items.map((item) => item.id);
        const accountTabIds = ACCOUNT_MENU.items.map((item) => item.id);
        if ((!isInProject && projectTabIds.includes(activeTab)) || (!isSignedIn && accountTabIds.includes(activeTab))) {
            setActiveTab(PREFERENCES_MENU.items[0].id);
        }
        // If user just signed in while on Login tab, switch to Profile
        if (isSignedIn && activeTab === "Login") {
            setActiveTab("Profile");
        }
    }, [isInProject, isSignedIn, activeTab, setActiveTab]);

    useEffect(() => {
        setDangerOpen(false);
    }, [activeTab]);

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
                        <h3>{t(`tabs.${activeTab}` as Parameters<typeof t>[0])}</h3>
                        <CloseSVG className={styles.close_btn} onClick={closeDashboard} />
                    </header>

                    <div className={styles.scrollArea}>
                        {/* Project tabs - only rendered when in project context */}
                        {isInProject && activeTab === "General" && <ProjectSettings dangerOpen={dangerOpen} onDangerToggle={() => setDangerOpen((v) => !v)} />}
                        {isInProject && activeTab === "Layout" && <LayoutSettings />}
                        {isInProject && activeTab === "Export" && <ExportProject />}
                        {isInProject && activeTab === "Collaborators" && <CollaboratorsSettings />}
                        {/* Preferences tabs */}
                        {activeTab === "Keybinds" && <KeybindsSettings />}
                        {activeTab === "Appearance" && <AppearanceSettings />}
                        {activeTab === "Language" && <LanguageSettings />}
                        {/* Account tabs - only when signed in */}
                        {isSignedIn && activeTab === "Profile" && <ProfileSettings dangerOpen={dangerOpen} onDangerToggle={() => setDangerOpen((v) => !v)} />}
                        {isSignedIn && activeTab === "Security" && <SecuritySettings />}
                        {/* Login tab - only when signed out */}
                        {!isSignedIn && activeTab === "Login" && <DashboardLogin />}
                        {/* About tab */}
                        {activeTab === "About" && <AboutSettings />}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardModal;
