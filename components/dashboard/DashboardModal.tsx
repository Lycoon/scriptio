"use client";

import { useContext, useEffect, useRef, useState, Suspense } from "react";
import { DashboardContext } from "@src/context/DashboardContext";

import SidebarMenu from "./DashboardSidebar";
import { useDashboardMenu } from "./useDashboardMenu";
import ProjectSettings from "./project/ProjectSettings";
import CollaboratorsSettings from "./project/CollaboratorsSettings";

import styles from "./DashboardModal.module.css";
import ExportProject from "./project/ExportProject";
import { ArrowLeft, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useIsPhone } from "@src/lib/utils/hooks";
import KeybindsSettings from "./preferences/KeybindsSettings";
import AppearanceSettings from "./preferences/AppearanceSettings";
import LanguageSettings from "./preferences/LanguageSettings";
import ProfileSettings from "./account/ProfileSettings";
import SubscriptionSettings from "./account/SubscriptionSettings";
import LayoutSettings from "./project/LayoutSettings";
import ProductionSettings from "./project/ProductionSettings";
import StorageSettings from "./project/StorageSettings";
import DashboardAuth from "./account/DashboardAuth";
import AboutSettings from "./AboutSettings";

const DashboardModal = () => {
    const { isOpen, closeDashboard, activeTab, setActiveTab, openedFromMenu, setMobileMenuOpen } =
        useContext(DashboardContext);
    const t = useTranslations("modal");
    const tSidebar = useTranslations("sidebar");
    const isPhone = useIsPhone();

    // Phone: the drawer shows one screen at a time — the sections list (nav
    // sidebar) or a section's content. When opened from the editor burger menu,
    // that menu *is* the sections list, so we skip straight to content and the
    // back arrow reopens the menu. When opened from the home Settings button
    // (no burger menu behind it), the dashboard shows its own sections list first
    // so preferences/account tabs are reachable, and the back arrow returns to it.
    const [mobileShowSections, setMobileShowSections] = useState(false);

    const handleBack = () => {
        if (openedFromMenu) {
            closeDashboard();
            setMobileMenuOpen(true);
        } else {
            setMobileShowSections(true);
        }
    };

    const {
        structure: menuStructure,
        projectMenu: PROJECT_MENU,
        preferencesMenu: PREFERENCES_MENU,
        accountMenu: ACCOUNT_MENU,
        isInProject,
        isSignedIn,
        isUserLoading,
    } = useDashboardMenu();

    const [dangerOpen, setDangerOpen] = useState(false);

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

    // On each open, pick the starting phone screen: content when launched from a
    // menu (which already served as the list), otherwise the in-dashboard list.
    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
    if (prevIsOpen !== isOpen) {
        setPrevIsOpen(isOpen);
        if (isOpen) setMobileShowSections(!openedFromMenu);
    }

    // Picking a section from the phone list swaps to its content; desktop shows
    // both at once, so this just changes the active tab.
    const handleTabChange = (id: Parameters<typeof setActiveTab>[0]) => {
        setActiveTab(id);
        if (isPhone) setMobileShowSections(false);
    };

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
            <div
                className={`${styles.modal} ${isPhone && mobileShowSections ? styles.mobileSections : ""}`}
                onClick={(e) => e.stopPropagation()}
            >
                <SidebarMenu structure={menuStructure} activeTab={activeTab} onTabChange={handleTabChange} />

                <div className={styles.content}>
                    <header className={styles.contentHeader}>
                        <div className={styles.headerLeft}>
                            {isPhone && (
                                <button
                                    className={styles.back_btn}
                                    onClick={handleBack}
                                    aria-label={tSidebar("back")}
                                >
                                    <ArrowLeft size={20} />
                                </button>
                            )}
                            <h3>{t(`tabs.${activeTab}` as Parameters<typeof t>[0])}</h3>
                        </div>
                        <X className={styles.close_btn} onClick={closeDashboard} />
                    </header>

                    <div className={`${styles.scrollArea} ${isScrolled ? styles.scrolled : ""}`} onScroll={handleScroll}>
                        {/* Project tabs - only rendered when in project context */}
                        {isInProject && activeTab === "General" && <ProjectSettings dangerOpen={dangerOpen} onDangerToggle={() => setDangerOpen((v) => !v)} />}
                        {isInProject && activeTab === "Layout" && <LayoutSettings />}
                        {isInProject && activeTab === "Production" && <ProductionSettings />}
                        {isInProject && activeTab === "Export" && <ExportProject />}
                        {isInProject && activeTab === "Storage" && <StorageSettings />}
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
