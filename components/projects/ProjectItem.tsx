import Image from "next/image";
import Router from "next/router";
import { Project } from "../../pages/api/users";

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

  return (
    <button className="project-item" onClick={() => openProject(project.id)}>
      <div className="project-item-flex">
        <div>
          <h2 className="project-item-title">{project.title}</h2>
          <div className="project-date">
            <Image
              className="calendar-icon"
              src="images/calendar.png"
              alt="Calendar icon"
            />
            <p className="project-date-text">{getLastUpdate(days)}</p>
          </div>
        </div>
        <Image
          className="movie-poster"
          src="https://i.imgur.com/ySkNtJF.png"
          alt="Movie poster"
        />
      </div>
    </button>
  );
};

export default ProjectItem;
