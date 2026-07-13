"use client";

import { useContext, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleCheckBig, WifiOff, WifiSync } from "lucide-react";

import { ProjectContext } from "@src/context/ProjectContext";
import { useProjectIdFromUrl } from "@src/lib/utils/hooks";
import { ConnectionStatus } from "@src/lib/utils/enums";
import type { StorageUsage } from "@src/lib/assets/cloud-asset-sync";

import navbar from "./ProjectNavbar.module.css";

/**
 * Presentational navbar pieces shared by the desktop bar ([ProjectNavbar]) and
 * the phone bar ([ProjectNavbarMobile]). Kept here so neither layout has to reach
 * into the other's file and the two can't drift.
 */

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

/** Connection status dot with a hover panel showing sync state + storage usage. */
export const StatusIndicator = () => {
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

/** Stacked avatars of the project's collaborators (desktop only, hidden solo). */
export const CollaboratorsDisplay = () => {
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
