"use client";

import { getElapsedDaysFrom } from "@src/lib/utils/misc";
import { useTranslations } from "next-intl";
import Image from "next/image";

import item from "./ProjectItem.module.css";
import { useAppNavigation } from "@src/lib/utils/navigation";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { usePosterUrl } from "@src/lib/posters/use-poster-url";
import { CloudCheck, HardDrive } from "lucide-react";

type Props = {
    project: ProjectMembershipPayload["project"];
    isLocalOnly?: boolean;
};

const ProjectItem = ({ project, isLocalOnly = false }: Props) => {
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
                </span>
            </div>

            <span className={item.date_cell}>{lastUpdated}</span>

            <span className={item.storage_cell} title={storageLabel}>
                <StorageIcon className={item.icon} size={16} />
                <span className={item.storage_label}>{storageLabel}</span>
            </span>
        </button>
    );
};

export default ProjectItem;
