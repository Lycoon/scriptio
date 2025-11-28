import { Project } from "@src/lib/utils/types";
import { _MS_PER_DAY, getElapsedDaysFrom, getLastUpdate, join } from "@src/lib/utils/misc";

import CalendarSVG from "@public/images/calendar.svg";

import item from "./ProjectItem.module.css";
import { redirectScreenplay } from "@src/lib/utils/redirects";

type Props = {
    project: Project;
    deleteMode: boolean;
    deleteProject: (userId: number, projectId: string) => void;
};

const ProjectItem = ({ project, deleteMode, deleteProject }: Props) => {
    const elapsedDays = getElapsedDaysFrom(project.updatedAt);
    const lastUpdated = getLastUpdate(elapsedDays);

    let posterPath;
    if (project.poster) posterPath = "/api/s3/" + project.poster;
    else posterPath = "/images/default-poster.png";

    return (
        <button
            className={join(item.container, deleteMode ? item.delete : "")}
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
                <div className={item.title_flex}>
                    <div>
                        <h2 className={item.title}>{project.title}</h2>
                        <div className={item.date}>
                            <CalendarSVG className={item.calendar} alt="Calendar icon" />
                            <p className={item.date_text}>{lastUpdated}</p>
                        </div>
                    </div>
                    <img className={item.poster} src={posterPath} alt="Movie poster" />
                </div>
            )}
        </button>
    );
};

export default ProjectItem;
