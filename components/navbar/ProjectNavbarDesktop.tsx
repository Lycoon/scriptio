"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
    AudioLines,
    BarChart2,
    CircleArrowLeft,
    CloudUpload,
    History,
    Lock,
    Monitor,
    Settings,
} from "lucide-react";

import { uploadToCloudPopup } from "@src/lib/screenplay/popup";
import { useIsTouch } from "@src/lib/utils/hooks";
import { join } from "@src/lib/utils/misc";

import { useProjectNavbar } from "./useProjectNavbar";
import { StatusIndicator, CollaboratorsDisplay } from "./ProjectNavbarShared";
import SavesPanel from "./SavesPanel";
import ProductionPanel from "./ProductionPanel";
import ReadAloudPanel from "./ReadAloudPanel";
import ScreenplayFormatDropdown from "./ScreenplayFormatDropdown";
import ScreenplaySearch from "./ScreenplaySearch";
import AnalyticsModal from "@components/analytics/AnalyticsModal";

import navbar from "./ProjectNavbar.module.css";
import navBtn from "@components/utils/NavbarIconButton.module.css";

/** Wrapper that anchors a panel (Saves/Production/ReadAloud) to its trigger. */
const panelAnchorStyle: React.CSSProperties = {
    position: "relative",
    height: "100%",
    width: "fit-content",
    display: "flex",
    alignItems: "center",
};

/**
 * Desktop/web project navbar: back button + title + history/production/read-aloud
 * on the left, the format dropdown centred, collaborators/search/analytics/settings
 * on the right. The phone layout lives in [ProjectNavbarMobile]; both draw shared
 * project state from {@link useProjectNavbar}.
 *
 * Tablets land here too (they are wide enough for the desktop layout, see
 * [ProjectNavbar]), but they get [MobileFormatToolbar] above the on-screen
 * keyboard — which carries the same element/style/alignment controls — so the
 * centred dropdown is dropped on touch to avoid offering both at once. With a
 * hardware keyboard attached neither is shown, and the element shortcuts
 * (see DEFAULT_KEYBINDS) cover it.
 */
const ProjectNavbarDesktop = () => {
    const t = useTranslations("navbar");
    const isTouch = useIsTouch();

    const {
        openDashboard,
        membership,
        userCtx,
        isPro,
        projectId,
        isInProject,
        canUploadToCloud,
        projectTitle,
        onTitleChange,
        onTitleBlur,
        backToProjects,
    } = useProjectNavbar();

    const [isSavesOpen, setIsSavesOpen] = useState(false);
    const [isProductionOpen, setIsProductionOpen] = useState(false);
    const [isReadAloudOpen, setIsReadAloudOpen] = useState(false);
    const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);

    return (
        <nav className={join(navbar.container)}>
            {/* Left side - Back button, title, panels */}
            <nav className={navbar.left_btns}>
                {isInProject && (
                    <div className={navbar.back_btn} onClick={backToProjects}>
                        <CircleArrowLeft size={18} />
                    </div>
                )}
                {isInProject && projectId && (
                    <div className={navbar.navBtns}>
                        <div className={navbar.navbar_island}>
                            {membership ? (
                                <StatusIndicator />
                            ) : canUploadToCloud ? (
                                <div
                                    className={navbar.tooltip}
                                    data-hint={t("uploadToCloud")}
                                    onClick={() => uploadToCloudPopup(projectId, userCtx)}
                                    style={{ cursor: "pointer" }}
                                >
                                    <CloudUpload
                                        style={{ color: "var(--primary-text)" }}
                                        className={navbar.status_icon}
                                    />
                                </div>
                            ) : (
                                <div className={navbar.tooltip} data-hint={t("localProject")}>
                                    <Monitor
                                        style={{ color: "var(--secondary-text)" }}
                                        className={navbar.status_icon}
                                    />
                                </div>
                            )}
                            <div className={navbar.title_wrapper} data-value={projectTitle}>
                                <input
                                    type="text"
                                    className={navbar.title_box}
                                    size={1}
                                    onChange={(e) => onTitleChange(e.target.value)}
                                    onBlur={onTitleBlur}
                                    value={projectTitle}
                                />
                            </div>
                        </div>
                        <div style={panelAnchorStyle}>
                            <div
                                className={`${navBtn.button} ${isSavesOpen ? navBtn.active : ""}`}
                                onClick={() => setIsSavesOpen(!isSavesOpen)}
                            >
                                <History size={18} />
                            </div>
                            <SavesPanel
                                projectId={projectId}
                                isOpen={isSavesOpen}
                                onClose={() => setIsSavesOpen(false)}
                                isPro={isPro}
                            />
                        </div>
                        <div style={panelAnchorStyle}>
                            <div
                                className={`${navBtn.button} ${isProductionOpen ? navBtn.active : ""}`}
                                onClick={() => setIsProductionOpen(!isProductionOpen)}
                            >
                                <Lock size={18} />
                            </div>
                            <ProductionPanel
                                isOpen={isProductionOpen}
                                onClose={() => setIsProductionOpen(false)}
                            />
                        </div>
                        <div style={panelAnchorStyle}>
                            <div
                                className={`${navBtn.button} ${isReadAloudOpen ? navBtn.active : ""}`}
                                onClick={() => setIsReadAloudOpen(!isReadAloudOpen)}
                            >
                                <AudioLines size={18} />
                            </div>
                            <ReadAloudPanel
                                isOpen={isReadAloudOpen}
                                onClose={() => setIsReadAloudOpen(false)}
                            />
                        </div>
                    </div>
                )}
            </nav>
            {/* Center - Format dropdown (visible in a project regardless of which
                panel is open, but not on touch: the mobile toolbar owns these
                controls there — see the component doc above) */}
            {isInProject && projectId && !isTouch && (
                <div className={navbar.center}>
                    <div className={navbar.navbar_island}>
                        <ScreenplayFormatDropdown />
                    </div>
                </div>
            )}
            <AnalyticsModal isOpen={isAnalyticsOpen} onClose={() => setIsAnalyticsOpen(false)} />

            {/* Right side - Collaborators + Search + Analytics + Settings */}
            <div className={navbar.right_btns}>
                {isInProject && <CollaboratorsDisplay />}
                {isInProject && <ScreenplaySearch />}
                <div
                    className={`${navBtn.button} ${isAnalyticsOpen ? navBtn.active : ""}`}
                    onClick={() => setIsAnalyticsOpen(true)}
                >
                    <BarChart2 size={18} />
                </div>
                <div className={navBtn.button} onClick={() => openDashboard("General")}>
                    <Settings size={18} />
                </div>
            </div>
        </nav>
    );
};

export default ProjectNavbarDesktop;
