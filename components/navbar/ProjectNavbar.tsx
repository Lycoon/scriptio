"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ConnectionStatus } from "@src/lib/utils/enums";
import { useCookieUser, useIsPro, useProjectIdFromUrl } from "@src/lib/utils/hooks";
import { redirectHome } from "@src/lib/utils/redirects";

import { ProjectContext } from "@src/context/ProjectContext";
import { useViewContext } from "@src/context/ViewContext";
import debounce from "debounce";
import { editProject } from "@src/lib/utils/requests";
import { join } from "@src/lib/utils/misc";
import { DashboardContext } from "@src/context/DashboardContext";
import {
    BarChart2,
    CircleArrowLeft,
    CircleCheckBig,
    History,
    Monitor,
    Settings,
    WifiOff,
    WifiSync,
} from "lucide-react";
import AnalyticsModal from "@components/analytics/AnalyticsModal";
import SavesPanel from "./SavesPanel";

import navbar from "./ProjectNavbar.module.css";
import navBtn from "@components/utils/NavbarIconButton.module.css";
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
    const { openDashboard } = useContext(DashboardContext);
    const { project: membership, setProjectTitle: setContextTitle } = useContext(ProjectContext);

    const [projectTitle, setProjectTitle] = useState<string>("");
    const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
    const [isSavesOpen, setIsSavesOpen] = useState(false);
    const isLocalEdit = useRef(false);

    const { user } = useCookieUser();
    const { isPro } = useIsPro();
    const projectId = useProjectIdFromUrl();

    const t = useTranslations("navbar");
    const viewContext = useViewContext();

    const isInProject = !!projectId;
    const hasScreenplay = viewContext.visiblePanels.includes("screenplay");
    const hasTitlePage = viewContext.visiblePanels.includes("title");

    const deferredTitleUpdate = useMemo(
        () =>
            debounce(async (projectId: string, newTitle: string) => {
                const { isLocalOnlyProject, updateCachedProject } =
                    await import("@src/lib/persistence/storage-provider/local-persistence");
                if (await isLocalOnlyProject(projectId)) {
                    await updateCachedProject(projectId, { title: newTitle });
                } else {
                    await editProject(projectId, { title: newTitle });
                    await updateCachedProject(projectId, { title: newTitle });
                }
            }, 1000),
        [],
    );

    // Load project title - from membership or local storage
    useEffect(() => {
        if (membership && !isLocalEdit.current) {
            setProjectTitle(membership.project.title);
            return;
        }

        // For local projects, load title from local storage (SQLite on desktop, IndexedDB on browser)
        if (projectId && !membership) {
            const loadLocalTitle = async () => {
                const { isCachedProject, getCachedProject } =
                    await import("@src/lib/persistence/storage-provider/local-persistence");
                if (await isCachedProject(projectId)) {
                    const cachedProject = await getCachedProject(projectId);
                    if (cachedProject && !isLocalEdit.current) {
                        setProjectTitle(cachedProject.title);
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

    return (
        <nav className={join(navbar.container)}>
            {/* Left side - Back button, title, split toggle */}
            <nav className={navbar.left_btns}>
                {isInProject && (
                    <div className={navbar.back_btn} onClick={() => redirectHome()}>
                        <CircleArrowLeft size={18} />
                    </div>
                )}
                {isInProject && projectId && (
                    <div className={navbar.navBtns}>
                        <div className={navbar.navbar_island}>
                            {membership ? (
                                <StatusIndicator />
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
                        <div
                            style={{
                                position: "relative",
                                height: "100%",
                                width: "fit-content",
                                display: "flex",
                                alignItems: "center",
                            }}
                        >
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
                    </div>
                )}
            </nav>
            {/* Center - Format dropdown */}
            {isInProject && projectId && (hasScreenplay || hasTitlePage) && (
                <div className={navbar.center}>
                    <div className={navbar.navbar_island}>
                        <ScreenplayFormatDropdown />
                    </div>
                </div>
            )}
            <AnalyticsModal isOpen={isAnalyticsOpen} onClose={() => setIsAnalyticsOpen(false)} />

            {/* Right side - Collaborators + Search + Settings */}
            <div className={navbar.right_btns}>
                {isInProject && <CollaboratorsDisplay />}
                {hasScreenplay && <ScreenplaySearch />}
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

export default ProjectNavbar;
