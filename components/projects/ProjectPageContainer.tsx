import { Project } from "@prisma/client";
import { useState } from "react";
import EmptyProjectPage from "./EmptyProjectPage";
import NewProjectItem from "./NewProjectItem";
import NewProjectPage from "./NewProjectPage";
import ProjectItem from "./ProjectItem";

type Props = {
  projects: Project[];
};

const sampleProject = {
  id: 0,
  userId: 1,
  title: "Titanic",
  description: "This is a simple description",
  createdAt: new Date(),
  updatedAt: new Date(),
  screenplay: "",
};

const ProjectPageContainer = ({ projects }: Props) => {
  console.log("projects: ", projects);
  const [isCreating, setIsCreating] = useState(false);

  if (isCreating) {
    return <NewProjectPage setIsCreating={setIsCreating} />;
  } else if (projects.length === 0) {
    return <EmptyProjectPage setIsCreating={setIsCreating} />;
  } else
    return (
      <div id="project-page-container">
        <div className="center-flex">
          <h1 id="project-page-title">Projects</h1>
          <div className="project-grid">
            <ProjectItem project={sampleProject} />
            <ProjectItem project={sampleProject} />
            <ProjectItem project={sampleProject} />
            {projects.map(function (project: Project) {
              return <ProjectItem project={project} />;
            })}
          </div>
        </div>
      </div>
    );
};

export default ProjectPageContainer;
