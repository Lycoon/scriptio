import { Project } from "@prisma/client";

type Props = {
  project: Project;
};

const ProjectItem = ({ project }: Props) => {
  return (
    <button className="project-item">
      <p>{project.title}</p>
    </button>
  );
};

export default ProjectItem;
