"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ConnectionStatus } from "@src/lib/utils/enums";
import { useCookieUser, useIsPhone, useIsPro, useProjectIdFromUrl } from "@src/lib/utils/hooks";

import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { useViewContext } from "@src/context/ViewContext";
import ProjectNavbarMobileMenu from "./ProjectNavbarMobileMenu";
import debounce from "debounce";
import { editProject } from "@src/lib/utils/requests";
import { join } from "@src/lib/utils/misc";
import { redirectHome } from "@src/lib/utils/redirects";
import { uploadToCloudPopup } from "@src/lib/screenplay/popup";
import type { StorageUsage } from "@src/lib/assets/cloud-asset-sync";
import { DashboardContext } from "@src/context/DashboardContext";
import {
    AudioLines,
    BarChart2,
    CircleArrowLeft,
    CircleCheckBig,
    CloudUpload,
    History,
    Info,
    LogIn,
    Lock,
    Menu,
    Monitor,
    Settings,
    WifiOff,
    WifiSync,
} from "lucide-react";
import AnalyticsModal from "@components/analytics/AnalyticsModal";
import { useDashboardMenu } from "@components/dashboard/useDashboardMenu";
import SavesPanel from "./SavesPanel";
import ProductionPanel from "./ProductionPanel";
import ReadAloudPanel from "./ReadAloudPanel";

import navbar from "./ProjectNavbar.module.css";
import mobileMenu from "./ProjectNavbarMobileMenu.module.css";
import navBtn from "@components/utils/NavbarIconButton.module.css";
import ScreenplayFormatDropdown from "./ScreenplayFormatDropdown";
import ScreenplaySearch from "./ScreenplaySearch";

/** Human-readable byte size, e.g. 1.4 GB. */
const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
    }
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
};

/** Last fetched usage, so re-hovering shows the previous numbers immediately (the
 *  panel unmounts on mouse-leave) instead of placeholders. Tagged with its project
 *  id so switching projects doesn't flash the wrong project's figures. */
let cachedStorage: { projectId: string; usage: StorageUsage } | null = null;

const StorageUsageBody = ({ projectId }: { projectId: string }) => {
    const t = useTranslations("navbar");
    const [usage, setUsage] = useState<StorageUsage | null>(() =>
        cachedStorage?.projectId === projectId ? cachedStorage.usage : null,
    );

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { fetchProjectStorage } = await import("@src/lib/assets/cloud-asset-sync");
            const data = await fetchProjectStorage(projectId);
            // Keep the last known value on a failed refresh rather than wiping it.
            if (!cancelled && data) {
                cachedStorage = { projectId, usage: data };
                setUsage(data);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    // Render the full layout immediately (stable size); only the amounts fill in
    // once fetched, so the panel doesn't grow after appearing.
    const pct = usage && usage.quota > 0 ? Math.min(100, Math.round((usage.ownerTotalUsed / usage.quota) * 100)) : 0;

    return (
        <>
            <div className={navbar.storage_row}>
                <span>{t("storageProject")}</span>
                <span>{usage ? formatBytes(usage.projectUsed) : "—"}</span>
            </div>
            <div className={navbar.storage_row}>
                <span>{t("storageTotal")}</span>
                <span>
                    {usage ? `${formatBytes(usage.ownerTotalUsed)} / ${formatBytes(usage.quota)}` : "—"}
                </span>
            </div>
            <div className={navbar.storage_bar}>
                <div className={navbar.storage_bar_fill} style={{ width: `${pct}%` }} />
            </div>
        </>
    );
};

const StatusIndicator = () => {
    const { connectionStatus } = useContext(ProjectContext);
    const projectId = useProjectIdFromUrl();
    const [hovered, setHovered] = useState(false);
    const t = useTranslations("navbar");
    const STATUS: Record<ConnectionStatus, string> = {
        connected: t("synced"),
        disconnected: t("noConnection"),
        connecting: t("reconnecting"),
    };
    return (
        <div
            className={navbar.status_wrapper}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {connectionStatus === "connected" && (
                <CircleCheckBig style={{ color: "var(--success)" }} className={navbar.status_icon} />
            )}
            {connectionStatus === "disconnected" && (
                <WifiOff style={{ color: "var(--error)" }} className={navbar.status_icon} />
            )}
            {connectionStatus === "connecting" && (
                <WifiSync style={{ color: "var(--warning)" }} className={navbar.status_icon} />
            )}
            {hovered && (
                <div className={navbar.storage_panel}>
                    <div className={navbar.storage_status}>{STATUS[connectionStatus]}</div>
                    {projectId && (
                        <>
                            <div className={navbar.storage_separator} />
                            <StorageUsageBody projectId={projectId} />
                        </>
                    )}
                </div>
            )}
        </div>
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
    const userCtx = useContext(UserContext);

    const [projectTitle, setProjectTitle] = useState<string>("");
    const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
    const [isSavesOpen, setIsSavesOpen] = useState(false);
    const [isProductionOpen, setIsProductionOpen] = useState(false);
    const [isReadAloudOpen, setIsReadAloudOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isLocalOnly, setIsLocalOnly] = useState<boolean | null>(null);
    const isLocalEdit = useRef(false);

    const isPhone = useIsPhone();
    const { setLeftSidebarOpen, setRightSidebarOpen } = useViewContext();

    // Return to the projects list by clearing the ?projectId query. Use the same
    // redirect() primitive that opens a project (ProjectItem → redirectScreenplay):
    // in the Tauri static export a query-only router.replace("/projects") does not
    // reliably re-render the layout back to the list (useSearchParams doesn't pick
    // up the change), whereas redirect() — which successfully swaps projectId in the
    // other direction — does. redirect() navigates cleanly from a client handler
    // here (it's what ProjectItem relies on), so it works on web and native alike.
    const backToProjects = () => redirectHome();

    const { isPro } = useIsPro();
    const { user } = useCookieUser();
    const projectId = useProjectIdFromUrl();

    const t = useTranslations("navbar");
    const tModal = useTranslations("modal");
    const tSidebar = useTranslations("sidebar");

    // The dashboard's nav lives in this burger on phone (the modal drops its
    // sidebar there), so the same grouped tabs are rendered below and open the
    // dashboard directly on the chosen tab.
    const { structure: dashboardMenu, isSignedIn } = useDashboardMenu();

    useEffect(() => {
        if (!projectId) {
            setIsLocalOnly(null);
            return;
        }
        let cancelled = false;
        (async () => {
            const { isLocalOnlyProject, cachedProjectExists } =
                await import("@src/lib/persistence/storage-provider/local-persistence");
            const exists = await cachedProjectExists(projectId);
            const local = exists ? await isLocalOnlyProject(projectId) : false;
            if (!cancelled) setIsLocalOnly(local);
        })();
        return () => {
            cancelled = true;
        };
    }, [projectId, membership]);

    const canUploadToCloud = !membership && !!user && isPro && !!projectId && isLocalOnly === true;

    const isInProject = !!projectId;

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

    if (isPhone) {
        return (
            <nav className={join(navbar.container)}>
                <nav className={navbar.mobile_bar}>
                    {isInProject && projectId && (
                        <div className={navbar.mobile_center}>
                            <div className={navbar.navbar_island}>
                                <ScreenplayFormatDropdown />
                            </div>
                        </div>
                    )}
                    {/* Left/right sidebars open via the editor edge chevrons (same as
                        desktop); settings live in the burger menu below. */}
                    <div className={navbar.mobile_right}>
                        {isInProject && <ScreenplaySearch />}
                        <div
                            className={`${navBtn.button} ${isMobileMenuOpen ? navBtn.active : ""}`}
                            onClick={() =>
                                setIsMobileMenuOpen((prev) => {
                                    const next = !prev;
                                    // The menu drawer opens on the right, same as the format
                                    // sidebar; close both side drawers so it opens cleanly on top.
                                    if (next) {
                                        setLeftSidebarOpen(false);
                                        setRightSidebarOpen(false);
                                    }
                                    return next;
                                })
                            }
                        >
                            <Menu size={18} />
                        </div>
                    </div>
                </nav>

                {isInProject && projectId && (
                    <ProjectNavbarMobileMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)}>
                        <div className={mobileMenu.title_row}>
                            {membership ? (
                                <StatusIndicator />
                            ) : (
                                <Monitor className={navbar.status_icon} style={{ color: "var(--secondary-text)" }} />
                            )}
                            <input
                                type="text"
                                className={mobileMenu.title_input}
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

                        {canUploadToCloud && (
                            <button
                                className={mobileMenu.item}
                                onClick={() => {
                                    uploadToCloudPopup(projectId, userCtx);
                                    setIsMobileMenuOpen(false);
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
                                setIsMobileMenuOpen(false);
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
                                            openDashboard(tab.id);
                                            setIsMobileMenuOpen(false);
                                        }}
                                    >
                                        {tab.icon}
                                        <span>{tab.label}</span>
                                    </button>
                                ))}
                            </div>
                        ))}

                        {!isSignedIn && (
                            <button
                                className={mobileMenu.item}
                                onClick={() => {
                                    openDashboard("Auth");
                                    setIsMobileMenuOpen(false);
                                }}
                            >
                                <LogIn size={18} />
                                <span>{tSidebar("auth")}</span>
                            </button>
                        )}

                        <button
                            className={mobileMenu.item}
                            onClick={() => {
                                openDashboard("About");
                                setIsMobileMenuOpen(false);
                            }}
                        >
                            <Info size={18} />
                            <span>{tModal("tabs.About")}</span>
                        </button>

                        <div className={mobileMenu.separator} />

                        <button className={mobileMenu.item} onClick={backToProjects}>
                            <CircleArrowLeft size={18} />
                            <span>{t("back")}</span>
                        </button>
                    </ProjectNavbarMobileMenu>
                )}

                <AnalyticsModal isOpen={isAnalyticsOpen} onClose={() => setIsAnalyticsOpen(false)} />
            </nav>
        );
    }

    return (
        <nav className={join(navbar.container)}>
            {/* Left side - Back button, title, split toggle */}
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
            {/* Center - Format dropdown (always visible in a project, regardless
                of which panel is open) */}
            {isInProject && projectId && (
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

export default ProjectNavbar;
