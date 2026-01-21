"use client";

import { _MS_PER_DAY, getElapsedDaysFrom, getLastUpdate, join } from "@src/lib/utils/misc";

import item from "./ProjectItem.module.css";
import { redirectScreenplay } from "@src/lib/utils/redirects";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { Calendar, Cloud, HardDrive } from "lucide-react";

type Props = {
    project: ProjectMembershipPayload["project"];
    isLocalOnly?: boolean;
};

const ProjectItem = ({ project, isLocalOnly = false }: Props) => {
    const elapsedDays = getElapsedDaysFrom(project.updatedAt);
    const lastUpdated = getLastUpdate(elapsedDays);

    let posterPath;
    if (project.poster) posterPath = project.poster;
    else posterPath = "/images/default-poster.png";

    return (
        <button className={join(item.container)} onClick={() => redirectScreenplay(project.id)}>
            <div className={item.title_flex}>
                <div>
                    <div className={item.title_row}>
                        <h2 className={item.title}>{project.title}</h2>
                        <span className={item.sync_icon} title={isLocalOnly ? "Local only" : "Synced to cloud"}>
                            {isLocalOnly ? <HardDrive size={14} /> : <Cloud size={14} />}
                        </span>
                    </div>
                    <div className={item.date}>
                        <Calendar size={18} />
                        <p className={item.date_text}>{lastUpdated}</p>
                    </div>
                </div>
                <img className={item.poster} src={posterPath} alt="Movie poster" />
            </div>
        </button>
    );
};

export default ProjectItem;
