"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
    AudioLines,
    BarChart2,
    ChevronRight,
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
    // The tools group collapses to zero width to fold (see .tools_reveal), and
    // these are its flex children: without this they would squash on the way
    // down instead of being clipped by it.
    flexShrink: 0,
};

/**
 * Desktop/web project navbar: back button + title + the folded history/production/
 * read-aloud cluster on the left, the format dropdown centred, collaborators/
 * search/analytics/settings on the right. The phone layout lives in
 * [ProjectNavbarMobile]; both draw shared project state from
 * {@link useProjectNavbar}.
 *
 * The three screenplay tools sit behind a round chevron next to the title island
 * rather than loose in the bar, and expand onto one shared pill — the same
 * single-island treatment the phone bar gives them (.mobile_tools).
 *
 * Tablets land here too (they are wide enough for the desktop layout, see
 * [ProjectNavbar]), but they get [MobileFormatToolbar] above the on-screen
 * keyboard — which carries the same element/style/alignment controls — so the
 * centred dropdown is dropped on touch to avoid offering both at once — that bar
 * is shown whenever an editor is focused, docking at the bottom of the viewport
 * when a hardware keyboard means there is no on-screen one to ride, so dropping
 * the dropdown never leaves the controls unreachable. The bottom chrome a tablet
 * does need — undo/redo, the view-mode toggles — rides that bar as flanking
 * islands rather than crowding in here.
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

    // The tools cluster is folded away by default and expands on the chevron.
    const [isToolsOpen, setIsToolsOpen] = useState(false);
    const anyPanelOpen = isSavesOpen || isProductionOpen || isReadAloudOpen;

    // Folding closes whatever panel is up: its trigger is about to be clipped
    // away, so the panel would be left stranded with no way to dismiss it by
    // re-tapping (same reasoning as the phone bar's board-canvas cleanup).
    const toggleTools = () => {
        if (isToolsOpen) {
            setIsSavesOpen(false);
            setIsProductionOpen(false);
            setIsReadAloudOpen(false);
        }
        setIsToolsOpen(!isToolsOpen);
    };

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
                        {/* One island for the whole cluster: the chevron that folds the
                            tools away sits on the same pill they expand onto, so it
                            reads as a single control rather than a button parked next
                            to a pill. Folded, the island is just the chevron. */}
                        <div className={navbar.tools_island}>
                            <div
                                className={join(
                                    navBtn.button,
                                    navbar.tools_icon,
                                    isToolsOpen ? navbar.tools_toggle_open : "",
                                )}
                                onClick={toggleTools}
                                aria-label={t("tools")}
                                aria-expanded={isToolsOpen}
                            >
                                <ChevronRight size={18} className={navbar.tools_chevron} />
                            </div>
                            {/* Folded, this collapses to zero width and its group clips,
                                so the buttons inside are unreachable as well as invisible
                                — they stay mounted only so the reveal can animate. */}
                            <div
                                className={join(
                                    navbar.tools_reveal,
                                    isToolsOpen ? navbar.tools_reveal_open : "",
                                )}
                                aria-hidden={!isToolsOpen}
                            >
                                <div
                                    className={join(
                                        navbar.tools_group,
                                        // Panels drop below the bar, so the group has to
                                        // stop clipping while one is open. Safe: a panel
                                        // can only be opened expanded, and folding closes
                                        // them first.
                                        anyPanelOpen ? navbar.tools_group_overflow : "",
                                    )}
                                >
                                    <div style={panelAnchorStyle}>
                                        <div
                                            className={join(
                                                navBtn.button,
                                                navbar.tools_icon,
                                                isSavesOpen ? navbar.tools_icon_active : "",
                                            )}
                                            onClick={() => setIsSavesOpen(!isSavesOpen)}
                                            aria-label={t("history")}
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
                                            className={join(
                                                navBtn.button,
                                                navbar.tools_icon,
                                                isProductionOpen ? navbar.tools_icon_active : "",
                                            )}
                                            onClick={() => setIsProductionOpen(!isProductionOpen)}
                                            aria-label={t("production")}
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
                                            className={join(
                                                navBtn.button,
                                                navbar.tools_icon,
                                                isReadAloudOpen ? navbar.tools_icon_active : "",
                                            )}
                                            onClick={() => setIsReadAloudOpen(!isReadAloudOpen)}
                                            aria-label={t("readAloud")}
                                        >
                                            <AudioLines size={18} />
                                        </div>
                                        <ReadAloudPanel
                                            isOpen={isReadAloudOpen}
                                            onClose={() => setIsReadAloudOpen(false)}
                                        />
                                    </div>
                                </div>
                            </div>
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
