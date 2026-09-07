"use client";

import { getElapsedDaysFrom } from "@src/lib/utils/misc";
import { useTranslations } from "next-intl";
import Image from "next/image";

import item from "./ProjectItem.module.css";
import { useAppNavigation } from "@src/lib/utils/navigation";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { usePosterUrl } from "@src/lib/posters/use-poster-url";
import { CloudCheck, HardDrive, Users } from "lucide-react";
import { shortenPath } from "@src/lib/persistence/file-binding";

/** Roughly what the title column holds before the date column starts. */
const PATH_MAX_CHARS = 52;

type Props = {
    project: ProjectMembershipPayload["project"];
    isLocalOnly?: boolean;
    /** Set when this project also writes itself to a file on this machine. */
    filePath?: string;
};

const ProjectItem = ({ project, isLocalOnly = false, filePath }: Props) => {
    const t = useTranslations("projects");
    const { goToProject } = useAppNavigation();
    const tDates = useTranslations("dates");
    // Resolved from the local poster store, so local-only projects show a poster
    // and cloud ones keep showing theirs offline.
    const posterUrl = usePosterUrl(project.id, !isLocalOnly);
    const elapsedDays = getElapsedDaysFrom(project.updatedAt);
    const lastUpdated =
        elapsedDays === 0
            ? tDates("today")
            : elapsedDays === 1
              ? tDates("yesterday")
              : elapsedDays <= 30
                ? tDates("daysAgo", { days: elapsedDays })
                : elapsedDays <= 365
                  ? tDates("monthsAgo", { months: Math.round(elapsedDays / 30) })
                  : tDates("moreThanYearAgo");

    const posterPath = posterUrl ?? "/images/default-poster.png";

    const storageLabel = isLocalOnly ? t("item.localOnly") : t("item.syncedToCloud");
    const StorageIcon = isLocalOnly ? HardDrive : CloudCheck;

    /* Only worth a glyph once the project is actually shared: every cloud project
       has at least its owner, so a "1" next to the cloud icon would sit on every
       row and tell the user nothing. Undefined for a project read back from the
       local cache — the count is the cloud's to know. */
    const collaborators = project.collaboratorCount;
    const isShared = !isLocalOnly && collaborators !== undefined && collaborators > 1;
    const collaboratorsBadge = isShared && (
        <span className={item.collaborators}>
            <Users className={item.icon} size={14} />
            <span>{collaborators}</span>
        </span>
    );

    /* The path itself, not a glyph: a row that merely hints "there is a file"
       leaves the user to open the project to find out which one, and the whole
       point of showing it here is telling several projects' files apart at a
       glance. Under the title rather than in the storage column, which is 120px
       and could never carry one. The front is dropped when it is too long — the
       filename and its folder are the part worth keeping — and the full path
       stays on the tooltip. */
    const boundPath = filePath ? shortenPath(filePath, PATH_MAX_CHARS) : null;

    return (
        <button className={item.container} onClick={() => goToProject(project.id)}>
            <Image
                className={item.poster}
                src={posterPath}
                alt={t("item.posterAlt")}
                width={160}
                height={220}
                loading="eager"
                style={{ width: "34px", height: "auto", aspectRatio: "0.675" }}
            />

            <div className={item.title_cell}>
                <h2 className={item.title}>{project.title}</h2>
                {/* Phone: the date/storage columns collapse, so surface them inline. */}
                <span className={item.meta_inline}>
                    <StorageIcon className={item.icon} size={14} />
                    <span>{lastUpdated}</span>
                    {collaboratorsBadge}
                </span>
                {boundPath && (
                    <span className={item.file_path} title={filePath}>
                        {boundPath}
                    </span>
                )}
            </div>

            <span className={item.date_cell}>{lastUpdated}</span>

            <span className={item.storage_cell} title={storageLabel}>
                <StorageIcon className={item.icon} size={16} />
                <span className={item.storage_label}>{storageLabel}</span>
                {collaboratorsBadge}
            </span>
        </button>
    );
};

export default ProjectItem;
