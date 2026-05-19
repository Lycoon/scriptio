"use client";

import { useContext, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { DashboardContext } from "@src/context/DashboardContext";
import { ProjectContext } from "@src/context/ProjectContext";
import { useCookieUser } from "@src/lib/utils/hooks";

import SidebarMenu, { MenuSection } from "./DashboardSidebar";
import ProjectSettings from "./project/ProjectSettings";
import CollaboratorsSettings from "./project/CollaboratorsSettings";

import styles from "./DashboardModal.module.css";
import ExportProject from "./project/ExportProject";
import { CreditCard, FileDown, Folder, Globe, Keyboard, Lock, Palette, PanelsTopLeft, User, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import KeybindsSettings from "./preferences/KeybindsSettings";
import AppearanceSettings from "./preferences/AppearanceSettings";
import LanguageSettings from "./preferences/LanguageSettings";
import ProfileSettings from "./account/ProfileSettings";
import SubscriptionSettings from "./account/SubscriptionSettings";
import LayoutSettings from "./project/LayoutSettings";
import ProductionSettings from "./project/ProductionSettings";
import DashboardAuth from "./account/DashboardAuth";
import AboutSettings from "./AboutSettings";

const DashboardModal = () => {
    const { isOpen, closeDashboard, activeTab, setActiveTab } = useContext(DashboardContext);
    const { project, isYjsReady } = useContext(ProjectContext);
    const { user, isLoading: isUserLoading } = useCookieUser();
    const t = useTranslations("modal");

    const PROJECT_MENU = useMemo<MenuSection>(() => ({
        group: t("groups.project"),
        items: [
            { id: "General",       label: t("tabs.General"),       icon: <Folder size={18} /> },
            { id: "Layout",        label: t("tabs.Layout"),        icon: <PanelsTopLeft size={18} /> },
            { id: "Production",    label: t("tabs.Production"),    icon: <Lock size={18} /> },
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
            { id: "Profile",      label: t("tabs.Profile"),      icon: <User size={18} /> },
            { id: "Subscription", label: t("tabs.Subscription"), icon: <CreditCard size={18} /> },
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

    // Auto-switch active tab when the surrounding context changes:
    //  - leave a project tab when there's no longer a project to talk about
    //  - leave an account tab when the user signs out
    //  - on a real signed-out → signed-in *transition* while on the Auth form,
    //    jump to Profile so the user lands somewhere meaningful after sign-in.
    //
    // The transition guard (prevSignedInRef) is critical: without it, isSignedIn
    // arriving as `true` for the first time after the SWR resolves looks identical
    // to a real sign-in event, and clicking "Sign in" while user data is still
    // loading would silently bounce the user to Profile.
    const prevSignedInRef = useRef(isSignedIn);
    useEffect(() => {
        if (isUserLoading) return;
        const projectTabIds = PROJECT_MENU.items.map((item) => item.id);
        const accountTabIds = ACCOUNT_MENU.items.map((item) => item.id);
        if ((!isInProject && projectTabIds.includes(activeTab)) || (!isSignedIn && accountTabIds.includes(activeTab))) {
            setActiveTab(PREFERENCES_MENU.items[0].id);
        }
        const justSignedIn = isSignedIn && !prevSignedInRef.current;
        if (justSignedIn && activeTab === "Auth") {
            setActiveTab("Profile");
        }
        prevSignedInRef.current = isSignedIn;
    }, [isInProject, isSignedIn, isUserLoading, activeTab, setActiveTab, ACCOUNT_MENU, PREFERENCES_MENU, PROJECT_MENU]);

    const [prevActiveTab, setPrevActiveTab] = useState(activeTab);
    const [isScrolled, setIsScrolled] = useState(false);
    if (prevActiveTab !== activeTab) {
        setPrevActiveTab(activeTab);
        setDangerOpen(false);
        setIsScrolled(false);
    }

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const scrolled = e.currentTarget.scrollTop > 0;
        setIsScrolled((prev) => (prev !== scrolled ? scrolled : prev));
    };

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
                        <X className={styles.close_btn} onClick={closeDashboard} />
                    </header>

                    <div className={`${styles.scrollArea} ${isScrolled ? styles.scrolled : ""}`} onScroll={handleScroll}>
                        {/* Project tabs - only rendered when in project context */}
                        {isInProject && activeTab === "General" && <ProjectSettings dangerOpen={dangerOpen} onDangerToggle={() => setDangerOpen((v) => !v)} />}
                        {isInProject && activeTab === "Layout" && <LayoutSettings />}
                        {isInProject && activeTab === "Production" && <ProductionSettings />}
                        {isInProject && activeTab === "Export" && <ExportProject />}
                        {isInProject && activeTab === "Collaborators" && <CollaboratorsSettings />}
                        {/* Preferences tabs */}
                        {activeTab === "Keybinds" && <KeybindsSettings />}
                        {activeTab === "Appearance" && <AppearanceSettings />}
                        {activeTab === "Language" && <LanguageSettings />}
                        {/* Account tabs - only when signed in */}
                        {isSignedIn && activeTab === "Profile" && <ProfileSettings dangerOpen={dangerOpen} onDangerToggle={() => setDangerOpen((v) => !v)} />}
                        {isSignedIn && activeTab === "Subscription" && <SubscriptionSettings />}
                        {/* Auth tab - only when signed out */}
                        {!isSignedIn && activeTab === "Auth" && <Suspense><DashboardAuth /></Suspense>}
                        {/* About tab */}
                        {activeTab === "About" && <AboutSettings />}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardModal;
