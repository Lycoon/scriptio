"use client";

import { getElapsedDaysFrom, join } from "@src/lib/utils/misc";
import { useTranslations } from "next-intl";
import Image from "next/image";

import item from "./ProjectItem.module.css";
import { redirectScreenplay } from "@src/lib/utils/redirects";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { CloudCheck, HardDrive } from "lucide-react";

type Props = {
    project: ProjectMembershipPayload["project"];
    isLocalOnly?: boolean;
};

const ProjectItem = ({ project, isLocalOnly = false }: Props) => {
    const t = useTranslations("projects");
    const tDates = useTranslations("dates");
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

    let posterPath;
    if (project.poster) posterPath = project.poster;
    else posterPath = "/images/default-poster.png";

    return (
        <button className={join(item.container)} onClick={() => redirectScreenplay(project.id)}>
            <Image
                className={item.poster}
                src={posterPath}
                alt={t("item.posterAlt")}
                width={160}
                height={220}
                loading="eager"
                style={{ width: "52px", height: "auto", aspectRatio: "0.675" }}
            />
            <div className={item.info}>
                <h2 className={item.title}>{project.title}</h2>
                <div className={item.date}>
                    <span
                        className={item.sync_icon}
                        title={isLocalOnly ? t("item.localOnly") : t("item.syncedToCloud")}
                    >
                        {isLocalOnly ? (
                            <HardDrive className={item.icon} size={16} />
                        ) : (
                            <CloudCheck className={item.icon} size={16} />
                        )}
                    </span>
                    <p className={item.date_text}>{lastUpdated}</p>
                </div>
            </div>
        </button>
    );
};

export default ProjectItem;
