import Router from "next/router";
import { useEffect, useState } from "react";
import { Project } from "../../pages/api/users";

const ASSETS: string =
    "https://storage.gra.cloud.ovh.net/v1/AUTH_2bc9dd4c501e44f88f5d9ae20f5c6e83/scriptio/";

type Props = {
    project: Project;
};

const _MS_PER_DAY = 1000 * 60 * 60 * 24;
const getLastUpdate = (days: number) => {
    if (days === 0) return "Today";
    else if (days === 1) return "Yesterday";
    else if (days <= 30) return `${days} days ago`;
    else if (days <= 365) return `${days / 30} months ago`;
    else return "More than 1 year ago";
};

const openProject = (projectId: number) => {
    Router.push("/projects/" + projectId + "/editor");
};

const ProjectItem = ({ project }: Props) => {
    const days = Math.round((Date.now() - +project.updatedAt) / _MS_PER_DAY);
    const [displayDelete, updateDisplayDelete] = useState<boolean>(false);
    const posterPath =
        project.poster !== null
            ? ASSETS + project.poster
            : "/images/default-poster.png";

    return (
        <button
            className="project-item"
            onMouseEnter={() => updateDisplayDelete(true)}
            onMouseLeave={() => updateDisplayDelete(false)}
            onClick={() => openProject(project.id)}
        >
            <div className="project-item-flex">
                <div>
                    <h2 className="project-item-title">{project.title}</h2>
                    <div className="project-date">
                        <img
                            className="calendar-icon"
                            src="/images/calendar.png"
                            alt="Calendar icon"
                        />
                        <p className="project-date-text">
                            {getLastUpdate(days)}
                        </p>
                    </div>
                </div>
                <img
                    className="movie-poster"
                    src={posterPath}
                    alt="Movie poster"
                />
            </div>
        </button>
    );
};

export default ProjectItem;
