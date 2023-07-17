import Router from "next/router";
import { Project } from "@src/lib/utils/types";
import { getElapsedDaysFrom, getLastUpdate } from "@src/lib/utils/misc";

import item_dk from "./ProjectItemDesktop.module.css";
import item from "./ProjectItem.module.css";
import { redirectScreenplay } from "@src/lib/utils/redirects";

type Props = {
    project: Project;
    deleteMode: boolean;
    deleteProject: (userId: number, projectId: string) => void;
};

const ProjectItemDesktop = ({ project, deleteMode, deleteProject }: Props) => {
    const elapsedDays = getElapsedDaysFrom(project.updatedAt);
    const lastUpdated = getLastUpdate(elapsedDays);

    let posterPath;
    if (project.poster) posterPath = "/api/s3/" + project.poster;
    else posterPath = "/images/default-poster.png";

    return (
        <button
            className={item_dk.container + " " + (deleteMode ? item.delete : "")}
            onClick={() => {
                deleteMode ? deleteProject(project.userId, project.id) : redirectScreenplay(project.id);
            }}
        >
            {deleteMode ? (
                <div>
                    <h2 className={item.text_delete}>Delete</h2>
                    <p className={item.text_delete}>{project.title}</p>
                </div>
            ) : (
                <div className={item_dk.flex}>
                    <img className={item.poster} src={posterPath} alt="Movie poster" />
                    <div className={item_dk.info}>
                        <div>
                            <h2 className={item.title}>{project.title}</h2>
                            <div className={item_dk.date}>
                                <img className={item.calendar} src="/images/calendar.png" alt="Calendar icon" />
                                <p className={item.date_text}>{lastUpdated}</p>
                            </div>
                        </div>
                        <p className={item_dk.path}>path/path/path/path/path/path/path/path/</p>
                    </div>
                </div>
            )}
        </button>
    );
};

export default ProjectItemDesktop;
