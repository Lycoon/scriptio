import { useState } from "react";
import { Project } from "../../pages/api/users";
import EmptyProjectPage from "./EmptyProjectPage";
import NewProjectItem from "./NewProjectItem";
import NewProjectPage from "./NewProjectPage";
import ProjectItem from "./ProjectItem";

const sampleProject = {
    id: 0,
    userId: 1,
    title: "Titanic",
    description: "This is a simple description",
    createdAt: new Date(),
    updatedAt: new Date(),
    screenplay: "",
};

type Props = {
    projects: Project[];
};

const ProjectPageContainer = ({ projects: propProjects }: Props) => {
    // Getting back dates from workaround
    let projects = propProjects.map((e) => ({
        ...e,
        updatedAt: new Date(e.updatedAt),
        createdAt: new Date(e.createdAt),
    }));

    // Sorting by last updated
    projects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
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
                    <hr />
                    <div className="project-grid">
                        <NewProjectItem setIsCreating={setIsCreating} />
                        {projects.map(function (project: Project) {
                            return (
                                <ProjectItem
                                    key={project.id}
                                    project={project}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>
        );
};

export default ProjectPageContainer;
