import { Project } from "@prisma/client";

type Props = {
  project: Project;
};

const _MS_PER_DAY = 1000 * 60 * 60 * 24;

const ProjectItem = ({ project }: Props) => {
  const days = Math.round(
    (Date.now() - project.updatedAt.getDate()) / _MS_PER_DAY
  );

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
            <p className="project-date-text">3 months ago</p>
          </div>
        </div>
        <img className="movie-poster" src="https://i.imgur.com/ySkNtJF.png" />
      </div>
    </button>
  );
};

export default ProjectItem;
