import Router from "next/router";
import { Project } from "../../pages/api/users";

type Props = {
    project: Project;
    deleteMode: boolean;
    deleteProject: (userId: number, projectId: number) => void;
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
    Router.push("/projects/" + projectId + "/screenplay");
};

const ProjectItem = ({ project, deleteMode, deleteProject }: Props) => {
    const days = Math.round((Date.now() - +project.updatedAt) / _MS_PER_DAY);
    const lastUpdated = getLastUpdate(days);
    const posterPath =
        project.poster !== null
            ? "/api/s3/" + project.poster
            : "/images/default-poster.png";

    return (
        <button
            className={
                "project-item" + (deleteMode ? " project-item-delete" : "")
            }
            onClick={() => {
                deleteMode
                    ? deleteProject(project.userId, project.id)
                    : openProject(project.id);
            }}
        >
            {deleteMode ? (
                <div>
                    <h2 className="project-item-delete-title">Delete</h2>
                    <p className="project-item-delete-title">{project.title}</p>
                </div>
            ) : (
                <div className="project-item-flex">
                    <div>
                        <h2 className="project-item-title">{project.title}</h2>
                        <div className="project-date">
                            <img
                                className="calendar-icon"
                                src="/images/calendar.png"
                                alt="Calendar icon"
                            />
                            <p className="project-date-text">{lastUpdated}</p>
                        </div>
                    </div>
                    <img
                        className="movie-poster"
                        src={posterPath}
                        alt="Movie poster"
                    />
                </div>
            )}
        </button>
    );
};

export default ProjectItem;
