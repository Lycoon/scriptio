import { Project } from "@prisma/client";
import NewProjectItem from "./NewProjectItem";
import ProjectItem from "./ProjectItem";

type Props = {
  projects: Project[];
};

const ProjectPageContainer = ({ projects }: Props) => {
  return (
    <div id="project-page-container">
      <div className="center-flex">
        <h1 id="project-page-title">Projects</h1>
        <div className="project-grid">
          <ProjectItem
            project={{
              id: 0,
              userId: 1,
              title: "Dream of Resurrection",
              description: "This is a simple description",
              createdAt: new Date(),
              updatedAt: new Date(),
              screenplay: "",
            }}
          />
          <ProjectItem
            project={{
              id: 0,
              userId: 1,
              title: "Dream of Resurrection",
              description: "This is a simple description",
              createdAt: new Date(),
              updatedAt: new Date(),
              screenplay: "",
            }}
          />
          <ProjectItem
            project={{
              id: 0,
              userId: 1,
              title: "Dream of Resurrection",
              description: "This is a simple description",
              createdAt: new Date(),
              updatedAt: new Date(),
              screenplay: "",
            }}
          />
          {projects.map(function (project: Project) {
            return <ProjectItem project={project} />;
          })}
        </div>
      </div>
    </div>
  );
};

export default ProjectPageContainer;
