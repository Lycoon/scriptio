"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { isTauri } from "@tauri-apps/api/core";
import { ConnectionStatus } from "@src/lib/utils/enums";
import { useCookieUser, useProjectIdFromUrl } from "@src/lib/utils/hooks";
import { redirectHome } from "@src/lib/utils/redirects";

import { ProjectContext } from "@src/context/ProjectContext";
import { PanelType, useViewContext } from "@src/context/ViewContext";
import debounce from "debounce";
import { editProject } from "@src/lib/utils/requests";
import { join } from "@src/lib/utils/misc";
import { UserContext } from "@src/context/UserContext";
import { DashboardContext } from "@src/context/DashboardContext";
import {
    CircleArrowLeft,
    CircleCheckBig,
    Clapperboard,
    Eye,
    EyeClosed,
    FileText,
    LayoutDashboard,
    PanelRight,
    PanelRightClose,
    Settings,
    WifiOff,
    WifiSync,
} from "lucide-react";

import navbar from "./ProjectNavbar.module.css";
import ScreenplayFormatDropdown from "./ScreenplayFormatDropdown";
import ScreenplaySearch from "./ScreenplaySearch";

const StatusIndicator = () => {
    const { connectionStatus } = useContext(ProjectContext);
    const t = useTranslations("navbar");
    const STATUS: Record<ConnectionStatus, string> = {
        connected: t("synced"),
        disconnected: t("noConnection"),
        connecting: t("reconnecting"),
    };
    return (
        <>
            <div className={navbar.tooltip} data-hint={STATUS[connectionStatus]}>
                {connectionStatus === "connected" && (
                    <CircleCheckBig style={{ color: "var(--success)" }} className={navbar.status_icon} />
                )}
                {connectionStatus === "disconnected" && (
                    <WifiOff style={{ color: "var(--error)" }} className={navbar.status_icon} />
                )}
                {connectionStatus === "connecting" && (
                    <WifiSync style={{ color: "var(--warning)" }} className={navbar.status_icon} />
                )}
            </div>
        </>
    );
};

const getInitial = (name: string): string => {
    if (!name) return "?";
    return name.charAt(0).toUpperCase();
};

const CollaboratorsDisplay = () => {
    const { users } = useContext(ProjectContext);

    if (users.length <= 1) return null;

    const MAX_VISIBLE = 4;
    const visibleUsers = users.slice(0, MAX_VISIBLE);
    const remainingCount = users.length - MAX_VISIBLE;

    return (
        <div className={navbar.collaborators}>
            {visibleUsers.map((user, index) => (
                <div
                    key={index}
                    className={navbar.collaborator}
                    style={{ backgroundColor: user.color }}
                    data-hint={user.name}
                >
                    <span className={navbar.collaboratorInitial}>{getInitial(user.name)}</span>
                </div>
            ))}
            {remainingCount > 0 && <div className={navbar.collaboratorMore}>+{remainingCount}</div>}
        </div>
    );
};

const ProjectNavbar = () => {
    const { isZenMode, updateIsZenMode } = useContext(UserContext);
    const { openDashboard } = useContext(DashboardContext);
    const { project: membership, setProjectTitle: setContextTitle } = useContext(ProjectContext);

    const [projectTitle, setProjectTitle] = useState<string>("");
    const isLocalEdit = useRef(false);

    const { user } = useCookieUser();
    const projectId = useProjectIdFromUrl();

    const t = useTranslations("navbar");
    const viewContext = useViewContext();

    const isInProject = !!projectId;
    const hasScreenplay = viewContext.visiblePanels.includes("screenplay");
    const hasTitlePage = viewContext.visiblePanels.includes("title");

    const deferredTitleUpdate = useMemo(
        () =>
            debounce(async (projectId: string, newTitle: string) => {
                const { isLocalOnlyProject, updateLocalProject } = await import("@src/lib/persistence/local-projects");
                if (await isLocalOnlyProject(projectId)) {
                    await updateLocalProject(projectId, { title: newTitle });
                } else {
                    await editProject(projectId, { title: newTitle });
                }
            }, 1000),
        [],
    );

    const toggleZenMode = () => updateIsZenMode((prev) => !prev);

    const handlePanelClick = (panel: PanelType) => {
        if (viewContext.primaryPanel === panel && !viewContext.isSplit) return;
        viewContext.setPrimaryPanel(panel);
    };

    const handleSplitToggle = () => {
        if (viewContext.isSplit) {
            viewContext.setSecondaryPanel(null);
        } else {
            const other: PanelType =
                viewContext.primaryPanel === "screenplay"
                    ? "board"
                    : viewContext.primaryPanel === "title"
                      ? "screenplay"
                      : "screenplay";
            viewContext.setSecondaryPanel(other);
        }
    };

    const getPanelBtnStyle = (panel: PanelType) => {
        const isActive = viewContext.primaryPanel === panel && !viewContext.isSplit;
        return `${navbar.panel_btn} ${isActive ? navbar.panel_btn_active : ""}`;
    };

    // Load project title - from membership or local storage
    useEffect(() => {
        if (membership && !isLocalEdit.current) {
            setProjectTitle(membership.project.title);
            return;
        }

        // For local projects, load title from SQLite
        if (projectId && !membership && isTauri()) {
            const loadLocalTitle = async () => {
                const { isLocalProject, getLocalProject } = await import("@src/lib/persistence/local-projects");
                if (await isLocalProject(projectId)) {
                    const localProject = await getLocalProject(projectId);
                    if (localProject && !isLocalEdit.current) {
                        setProjectTitle(localProject.title);
                    }
                }
            };
            loadLocalTitle();
        }
    }, [membership, projectId]);

    // Update browser tab title when project title changes
    useEffect(() => {
        if (projectTitle && isInProject) {
            document.title = `${projectTitle}`;
        }
    }, [projectTitle, isInProject]);

    // On desktop (Tauri), allow navbar without user for local projects
    if (!user && !isTauri()) return null;

    return (
        <nav className={join(navbar.container)}>
            {/* Left side - Back button + Panel switcher */}
            <nav className={navbar.left_btns}>
                {isInProject && (
                    <div className={navbar.back_btn} onClick={() => redirectHome()}>
                        <CircleArrowLeft size={18} />
                    </div>
                )}
                {isInProject && projectId && (
                    <div className={navbar.navBtns}>
                        <div className={navbar.panel_switcher}>
                            <div className={getPanelBtnStyle("screenplay")} onClick={() => handlePanelClick("screenplay")}>
                                <Clapperboard size={14} />
                                {t("screenplay")}
                            </div>
                            <div className={getPanelBtnStyle("board")} onClick={() => handlePanelClick("board")}>
                                <LayoutDashboard size={14} />
                                {t("board")}
                            </div>
                            <div className={getPanelBtnStyle("title")} onClick={() => handlePanelClick("title")}>
                                <FileText size={14} />
                                {t("titlePage")}
                            </div>
                        </div>
                        <div
                            className={`${navbar.export_project_btn} ${viewContext.isSplit ? navbar.panel_btn_active : ""}`}
                            onClick={handleSplitToggle}
                        >
                            {viewContext.isSplit ? <PanelRightClose size={18} /> : <PanelRight size={18} />}
                        </div>
                    </div>
                )}
            </nav>
            {/* Center - Project title, format dropdown, and connection status */}
            {isInProject && projectId && (
                <div className={navbar.center}>
                    <div className={navbar.projectTitle}>
                        <StatusIndicator />
                        <div className={navbar.title_wrapper} data-value={projectTitle}>
                            <input
                                type="text"
                                className={navbar.title_box}
                                size={1}
                                onChange={(e) => {
                                    isLocalEdit.current = true;
                                    setProjectTitle(e.target.value);
                                    setContextTitle(e.target.value);
                                    deferredTitleUpdate(projectId, e.target.value);
                                }}
                                onBlur={() => {
                                    isLocalEdit.current = false;
                                }}
                                value={projectTitle}
                            />
                        </div>
                    </div>
                    {(hasScreenplay || hasTitlePage) && (
                        <div className={navbar.projectTitle}>
                            <ScreenplayFormatDropdown />
                        </div>
                    )}
                </div>
            )}
            {/* Right side - Collaborators + Search + Zen mode toggle + Settings */}
            <div className={navbar.right_btns}>
                {isInProject && <CollaboratorsDisplay />}
                {hasScreenplay && <ScreenplaySearch />}
                {hasScreenplay && (
                    <div className={navbar.export_project_btn} onClick={toggleZenMode}>
                        {isZenMode ? <EyeClosed size={18} /> : <Eye size={18} />}
                    </div>
                )}
                <div className={navbar.export_project_btn} onClick={() => openDashboard("General")}>
                    <Settings size={18} />
                </div>
            </div>
        </nav>
    );
};

export default ProjectNavbar;
