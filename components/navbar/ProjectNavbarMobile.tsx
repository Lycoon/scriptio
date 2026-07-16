"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
    ArrowLeft,
    AudioLines,
    BarChart2,
    Check,
    CloudUpload,
    History,
    Info,
    LogIn,
    LogOut,
    Lock,
    Menu,
    Monitor,
    Redo2,
    Undo2,
} from "lucide-react";

import { useViewContext } from "@src/context/ViewContext";
import { useActiveEditor } from "@src/lib/editor/use-active-editor";
import { uploadToCloudPopup } from "@src/lib/screenplay/popup";
import { join } from "@src/lib/utils/misc";

import { useProjectNavbar } from "./useProjectNavbar";
import { StatusIndicator } from "./ProjectNavbarShared";
import ProjectNavbarMobileMenu from "./ProjectNavbarMobileMenu";
import SavesPanel from "./SavesPanel";
import ProductionPanel from "./ProductionPanel";
import ReadAloudPanel from "./ReadAloudPanel";
import ScreenplaySearch from "./ScreenplaySearch";
import AnalyticsModal from "@components/analytics/AnalyticsModal";

import navbar from "./ProjectNavbar.module.css";
import mobileMenu from "./ProjectNavbarMobileMenu.module.css";
import navBtn from "@components/utils/NavbarIconButton.module.css";

/**
 * Phone project navbar: a slim two-cluster bar (edit-mode controls + search/burger)
 * whose burger opens the full menu that the desktop spreads across the bar and the
 * dashboard sidebar. Shared project state (title, sign-out, dashboard menu) comes
 * from {@link useProjectNavbar}; the desktop layout lives in [ProjectNavbar].
 */
const ProjectNavbarMobile = () => {
    const t = useTranslations("navbar");
    const tModal = useTranslations("modal");
    const tSidebar = useTranslations("sidebar");

    const {
        openDashboard,
        mobileMenuOpen,
        setMobileMenuOpen,
        membership,
        userCtx,
        canUploadToCloud,
        dashboardMenu,
        isSignedIn,
        projectId,
        isInProject,
        isPro,
        projectTitle,
        onTitleChange,
        onTitleBlur,
        backToProjects,
        onSignOut,
    } = useProjectNavbar();

    const { setLeftSidebarOpen, setRightSidebarOpen, chromeHidden, mobileEditMode, setMobileEditMode } =
        useViewContext();
    const activeEditor = useActiveEditor();

    const [isSavesOpen, setIsSavesOpen] = useState(false);
    const [isProductionOpen, setIsProductionOpen] = useState(false);
    const [isReadAloudOpen, setIsReadAloudOpen] = useState(false);
    const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);

    // Undo/redo are backed by the collaboration UndoManager. Guard on the command
    // existing so calling before Yjs is ready can't throw.
    const runHistory = (action: "undo" | "redo") => {
        if (activeEditor && typeof activeEditor.commands[action] === "function") {
            activeEditor.chain().focus()[action]().run();
        }
    };

    // Leave edit mode: blur so the keyboard dismisses immediately (the panel's
    // setEditable(false) also does this, but blur here makes it instant).
    const exitEditMode = () => {
        activeEditor?.commands.blur();
        setMobileEditMode(false);
    };

    return (
        <nav className={join(navbar.container, chromeHidden ? navbar.container_hidden : "")}>
            <nav className={navbar.mobile_bar}>
                {/* Left cluster: edit-mode controls (leave edit mode + undo/redo)
                    while editing; otherwise the back-to-projects arrow. */}
                {isInProject &&
                    projectId &&
                    (mobileEditMode ? (
                        <div className={navbar.mobile_left}>
                            <div className={`${navBtn.button} ${navbar.mobile_icon}`} onClick={exitEditMode}>
                                <Check size={18} />
                            </div>
                            <div className={`${navBtn.button} ${navbar.mobile_icon}`} onClick={() => runHistory("undo")}>
                                <Undo2 size={18} />
                            </div>
                            <div className={`${navBtn.button} ${navbar.mobile_icon}`} onClick={() => runHistory("redo")}>
                                <Redo2 size={18} />
                            </div>
                        </div>
                    ) : (
                        <div className={navbar.mobile_left}>
                            <div
                                className={`${navBtn.button} ${navbar.mobile_icon}`}
                                onClick={backToProjects}
                                aria-label={t("back")}
                            >
                                <ArrowLeft size={18} />
                            </div>
                        </div>
                    ))}
                {/* The element-type selector lives in the format bar above the
                    keyboard (MobileFormatToolbar); the sidebars open via the editor
                    edge chevrons; everything else is in the burger menu below. */}
                <div className={navbar.mobile_right}>
                    {isInProject && <ScreenplaySearch />}
                    <div
                        className={`${navBtn.button} ${navbar.mobile_icon} ${mobileMenuOpen ? navBtn.active : ""}`}
                        onClick={() => {
                            const next = !mobileMenuOpen;
                            // The menu drawer opens on the right, same as the format
                            // sidebar; close both side drawers so it opens cleanly on top.
                            if (next) {
                                setLeftSidebarOpen(false);
                                setRightSidebarOpen(false);
                            }
                            setMobileMenuOpen(next);
                        }}
                    >
                        <Menu size={18} />
                    </div>
                </div>
            </nav>

            {isInProject && projectId && (
                <ProjectNavbarMobileMenu isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)}>
                    <div className={mobileMenu.title_row}>
                        {membership ? (
                            <StatusIndicator />
                        ) : (
                            <Monitor className={navbar.status_icon} style={{ color: "var(--secondary-text)" }} />
                        )}
                        <input
                            type="text"
                            className={mobileMenu.title_input}
                            onChange={(e) => onTitleChange(e.target.value)}
                            onBlur={onTitleBlur}
                            value={projectTitle}
                        />
                    </div>

                    {canUploadToCloud && (
                        <button
                            className={mobileMenu.item}
                            onClick={() => {
                                uploadToCloudPopup(projectId, userCtx);
                                setMobileMenuOpen(false);
                            }}
                        >
                            <CloudUpload size={18} />
                            <span>{t("uploadToCloud")}</span>
                        </button>
                    )}

                    <div className={mobileMenu.separator} />

                    <div className={mobileMenu.section}>
                        <button
                            className={`${mobileMenu.item} ${isSavesOpen ? mobileMenu.item_active : ""}`}
                            onClick={() => setIsSavesOpen((prev) => !prev)}
                        >
                            <History size={18} />
                            <span>{t("history")}</span>
                        </button>
                        <SavesPanel
                            projectId={projectId}
                            isOpen={isSavesOpen}
                            onClose={() => setIsSavesOpen(false)}
                            isPro={isPro}
                        />
                    </div>

                    <div className={mobileMenu.section}>
                        <button
                            className={`${mobileMenu.item} ${isProductionOpen ? mobileMenu.item_active : ""}`}
                            onClick={() => setIsProductionOpen((prev) => !prev)}
                        >
                            <Lock size={18} />
                            <span>{t("production")}</span>
                        </button>
                        <ProductionPanel isOpen={isProductionOpen} onClose={() => setIsProductionOpen(false)} />
                    </div>

                    <div className={mobileMenu.section}>
                        <button
                            className={`${mobileMenu.item} ${isReadAloudOpen ? mobileMenu.item_active : ""}`}
                            onClick={() => setIsReadAloudOpen((prev) => !prev)}
                        >
                            <AudioLines size={18} />
                            <span>{t("readAloud")}</span>
                        </button>
                        <ReadAloudPanel isOpen={isReadAloudOpen} onClose={() => setIsReadAloudOpen(false)} />
                    </div>

                    <button
                        className={mobileMenu.item}
                        onClick={() => {
                            setIsAnalyticsOpen(true);
                            setMobileMenuOpen(false);
                        }}
                    >
                        <BarChart2 size={18} />
                        <span>{t("analytics")}</span>
                    </button>

                    <div className={mobileMenu.separator} />

                    {/* Dashboard settings — the modal drops its sidebar on phone, so
                        its grouped tabs are navigated from here; each opens the
                        dashboard directly on that tab. */}
                    {dashboardMenu.map((section) => (
                        <div key={section.group} className={mobileMenu.section}>
                            <div className={mobileMenu.group_label}>{section.group}</div>
                            {section.items.map((tab) => (
                                <button
                                    key={tab.id}
                                    className={mobileMenu.item}
                                    onClick={() => {
                                        openDashboard(tab.id, { fromMenu: true });
                                        setMobileMenuOpen(false);
                                    }}
                                >
                                    {tab.icon}
                                    <span>{tab.label}</span>
                                </button>
                            ))}
                        </div>
                    ))}

                    {/* Set the sign in/out + About actions apart from the dashboard
                        tab groups above, so they don't read as part of Preferences
                        (mirrors the DashboardModal sidebar's footer separation). */}
                    <div className={mobileMenu.separator} />

                    {isSignedIn ? (
                        <button
                            className={mobileMenu.item}
                            onClick={() => {
                                setMobileMenuOpen(false);
                                onSignOut();
                            }}
                        >
                            <LogOut size={18} />
                            <span>{tSidebar("logOut")}</span>
                        </button>
                    ) : (
                        <button
                            className={mobileMenu.item}
                            onClick={() => {
                                openDashboard("Auth", { fromMenu: true });
                                setMobileMenuOpen(false);
                            }}
                        >
                            <LogIn size={18} />
                            <span>{tSidebar("auth")}</span>
                        </button>
                    )}

                    <button
                        className={mobileMenu.item}
                        onClick={() => {
                            openDashboard("About", { fromMenu: true });
                            setMobileMenuOpen(false);
                        }}
                    >
                        <Info size={18} />
                        <span>{tModal("tabs.About")}</span>
                    </button>
                </ProjectNavbarMobileMenu>
            )}

            <AnalyticsModal isOpen={isAnalyticsOpen} onClose={() => setIsAnalyticsOpen(false)} />
        </nav>
    );
};

export default ProjectNavbarMobile;
