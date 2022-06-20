import { useState } from "react";
import { Project } from "../../pages/api/users";
import EmptyProjectPage from "./EmptyProjectPage";
import NewProjectPage from "./NewProjectPage";
import ProjectItem from "./ProjectItem";

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
                    <div className="project-container-header">
                        <div className="project-container-header-info">
                            <h1>Projects</h1>
                            <button
                                className="form-btn create-project-button"
                                onClick={() => setIsCreating(true)}
                            >
                                Create
                            </button>
                        </div>
                        <hr />
                    </div>
                    <div className="project-grid">
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
