import Router from "next/router";
import { Project } from "../../pages/api/users";

type Props = {
  project: Project;
};

const openProject = (projectId: number) => {
  Router.push("/projects/" + projectId + "/editor");
};

const _MS_PER_DAY = 1000 * 60 * 60 * 24;

const ProjectItem = ({ project }: Props) => {
  const days = Math.round((Date.now() - +project.updatedAt) / _MS_PER_DAY);

  return (
    <button className="project-item">
      <div className="project-item-flex">
        <div>
          <h2 className="project-item-title">{project.title}</h2>
          <div className="project-date">
            <img
              className="calendar-icon"
              src="images/calendar.png"
              alt="Calendar icon"
            ></img>
            <p className="project-date-text">{days} days ago</p>
          </div>
        </div>
        <img className="movie-poster" src="https://i.imgur.com/ySkNtJF.png" />
      </div>
    </button>
  );
};

export default ProjectItem;
