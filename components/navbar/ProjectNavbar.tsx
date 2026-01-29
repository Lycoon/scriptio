"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { ConnectionStatus, Page } from "@src/lib/utils/enums";
import { useCookieUser, usePage, useProjectIdFromUrl } from "@src/lib/utils/hooks";
import { redirectBoard, redirectHome, redirectScreenplay, redirectStatistics } from "@src/lib/utils/redirects";

import { ProjectContext } from "@src/context/ProjectContext";
import debounce from "debounce";
import { editProject } from "@src/lib/utils/requests";
import { join } from "@src/lib/utils/misc";
import { UserContext } from "@src/context/UserContext";
import { DashboardContext } from "@src/context/DashboardContext";
import { CircleArrowLeft, CircleCheckBig, Eye, EyeClosed, Settings, WifiOff, WifiSync } from "lucide-react";

import navbar from "./ProjectNavbar.module.css";
import form from "./../utils/Form.module.css";
import ScreenplayFormatDropdown from "./ScreenplayFormatDropdown";
import ScreenplaySearch from "./ScreenplaySearch";

const StatusIndicator = () => {
    const { connectionStatus } = useContext(ProjectContext);
    const STATUS: Record<ConnectionStatus, string> = {
        connected: "Synced to cloud",
        disconnected: "No connection",
        connecting: "Reconnecting...",
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
    const { project: membership } = useContext(ProjectContext);

    const [isInProject, updateIsInProject] = useState<boolean>(false);
    const [hasScreenplay, updateHasScreenplay] = useState<boolean>(false);
    const [hasProjectHeader, updateHasProjectHeader] = useState<boolean>(false);
    const [projectTitle, setProjectTitle] = useState<string>("");
    const isLocalEdit = useRef(false);

    const page = usePage();
    const { user } = useCookieUser();
    const projectId = useProjectIdFromUrl();

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
    const getNavStyle = (tabName: string) => {
        return `${navbar.navBtn} ${form.label} ${page == tabName ? navbar.active : ""}`;
    };

    useEffect(() => {
        updateIsInProject(page === "screenplay" || page === "statistics" || page === "board");
        updateHasScreenplay(page === "screenplay");
        updateHasProjectHeader(page === "screenplay" || page === "board");
    }, [page]);

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
    if ((!user && !isTauri()) || !page) return null;

    return (
        <nav className={join(navbar.container)}>
            {/* Left side - Back button + Navigation tabs */}
            <nav className={navbar.left_btns}>
                {isInProject && (
                    <div className={navbar.back_btn} onClick={() => redirectHome()}>
                        <CircleArrowLeft size={18} />
                        <p>Home</p>
                    </div>
                )}
                {isInProject && projectId && (
                    <div className={navbar.navBtns}>
                        <p
                            className={`${getNavStyle("screenplay")}`}
                            onClick={() => {
                                page !== "screenplay" && redirectScreenplay(projectId);
                            }}
                        >
                            Screenplay
                        </p>
                        {/*<p
                            className={`${getNavStyle("statistics")}`}
                            onClick={() => {
                                page !== "statistics" && redirectStatistics(projectId);
                            }}
                        >
                            Statistics
                        </p>*/}
                        <p
                            className={`${getNavStyle("board")}`}
                            onClick={() => {
                                page !== "board" && redirectBoard(projectId);
                            }}
                        >
                            Board
                        </p>
                    </div>
                )}
            </nav>
            {/* Center - Project title, format dropdown, and connection status */}
            {hasProjectHeader && projectId && (
                <div className={navbar.projectTitle}>
                    <StatusIndicator />
                    <input
                        type="text"
                        className={navbar.title_box}
                        size={Math.max(projectTitle.length, 3)}
                        onChange={(e) => {
                            isLocalEdit.current = true;
                            setProjectTitle(e.target.value);
                            deferredTitleUpdate(projectId, e.target.value);
                        }}
                        onBlur={() => {
                            isLocalEdit.current = false;
                        }}
                        value={projectTitle}
                    />
                    {hasScreenplay && (
                        <>
                            <div className={navbar.title_separator} />
                            <ScreenplayFormatDropdown />
                        </>
                    )}
                </div>
            )}
            {/* Right side - Collaborators + Search + Zen mode toggle + Settings */}
            <div className={navbar.right_btns}>
                {hasProjectHeader && <CollaboratorsDisplay />}
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
