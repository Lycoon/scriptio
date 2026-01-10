"use client";

import { useContext, useEffect, useState } from "react";
import { ConnectionStatus, Page } from "@src/lib/utils/enums";
import { useCookieUser, usePage } from "@src/lib/utils/hooks";
import { redirectBoard, redirectHome, redirectScreenplay, redirectStatistics } from "@src/lib/utils/redirects";

import { useSWRConfig } from "swr";
import { ProjectContext } from "@src/context/ProjectContext";
import debounce from "debounce";
import { editProject } from "@src/lib/utils/requests";
import { join } from "@src/lib/utils/misc";
import { UserContext } from "@src/context/UserContext";
import { DashboardContext } from "@src/context/DashboardContext";
import { CircleArrowLeft, CircleCheckBig, Eye, EyeClosed, Settings, WifiOff, WifiSync } from "lucide-react";

import navbar from "./ProjectNavbar.module.css";
import form from "./../utils/Form.module.css";

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

    const page = usePage();
    const { mutate } = useSWRConfig();
    const { user } = useCookieUser();

    const deferredTitleUpdate = debounce(async (projectId: string, projectTitle: string) => {
        await editProject(projectId, { title: projectTitle });
        mutate(`/api/projects/${projectId}`, { ...membership, title: projectTitle });
    }, 1000);

    const toggleZenMode = () => updateIsZenMode((prev) => !prev);
    const getNavStyle = (tabName: string) => {
        return `${navbar.navBtn} ${form.label} ${page == tabName ? navbar.active : ""}`;
    };

    useEffect(() => {
        updateIsInProject(page === Page.Screenplay || page === Page.Statistics || page === Page.Board);
        updateHasScreenplay(page === Page.Screenplay);
        updateHasProjectHeader(page === Page.Screenplay || page === Page.Board);
    }, [page]);

    useEffect(() => {
        if (membership) setProjectTitle(membership.project.title);
    }, [membership]);

    if (!user || !page) return;

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
                {isInProject && membership && (
                    <div className={navbar.navBtns}>
                        <p
                            className={`${getNavStyle("screenplay")}`}
                            onClick={() => {
                                page !== Page.Screenplay && redirectScreenplay(membership.project.id);
                            }}
                        >
                            Screenplay
                        </p>
                        <p
                            className={`${getNavStyle("stats")}`}
                            onClick={() => {
                                page !== Page.Statistics && redirectStatistics(membership.project.id);
                            }}
                        >
                            Statistics
                        </p>
                        <p
                            className={`${getNavStyle("board")}`}
                            onClick={() => {
                                page !== Page.Board && redirectBoard(membership.project.id);
                            }}
                        >
                            Board
                        </p>
                    </div>
                )}
            </nav>
            {/* Center - Project title and connection status */}
            {hasProjectHeader && membership && (
                <div className={navbar.projectTitle}>
                    <StatusIndicator />
                    <input
                        type="text"
                        className={navbar.title_box}
                        onChange={(e) => deferredTitleUpdate(membership.project.id, e.target.value)}
                        defaultValue={projectTitle}
                    />
                </div>
            )}
            {/* Right side - Collaborators + Zen mode toggle + Settings */}
            <div className={navbar.right_btns}>
                {hasProjectHeader && <CollaboratorsDisplay />}
                {hasScreenplay && (
                    <div className={navbar.export_project_btn} onClick={toggleZenMode}>
                        {isZenMode ? <EyeClosed size={18} /> : <Eye size={18} />}
                    </div>
                )}
                <div className={navbar.export_project_btn} onClick={() => openDashboard("Settings")}>
                    <Settings size={18} />
                </div>
            </div>
        </nav>
    );
};

export default ProjectNavbar;
