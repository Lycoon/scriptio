import { useEffect, useState } from "react";
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Project } from "../../pages/api/users";
import { deleteProject } from "../../src/lib/requests";
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

    const [projs, setProjs] = useState(projects);
    const [isCreating, setIsCreating] = useState(false);
    const [deleteMode, setDeleteMode] = useState(false);
    const [parent] = useAutoAnimate();

    const deleteFromProjectPage = (userId: number, projectId: number) => {
        const updatedProjects: Project[] = [];
        projs.forEach((p: Project) => {
            if (p.id !== projectId) {
                updatedProjects.push(p);
            }
        });

        setProjs(updatedProjects);
        deleteProject(userId, projectId);
    };

    if (isCreating) {
        return <NewProjectPage setIsCreating={setIsCreating} />;
    } else if (projs.length === 0) {
        return <EmptyProjectPage setIsCreating={setIsCreating} />;
    } else
        return (
            <div id="project-page-container">
                <div className="center-flex">
                    <div className="project-container-header">
                        <div className="project-container-header-info">
                            <h1>Projects</h1>
                            <div className="project-container-header-buttons">
                                <div
                                    onClick={() => setDeleteMode(!deleteMode)}
                                    className="delete-project-btn"
                                >
                                    <img
                                        className="delete-project-icon"
                                        src="/images/trash.png"
                                    />
                                </div>
                                <button
                                    className="form-btn create-project-button"
                                    onClick={() => setIsCreating(true)}
                                >
                                    Create
                                </button>
                            </div>
                        </div>
                        <hr />
                    </div>
                    <div className="project-grid">
                        {projs.map(function (project: Project) {
                            return (
                                <ProjectItem
                                    key={project.id}
                                    project={project}
                                    deleteMode={deleteMode}
                                    deleteProject={deleteFromProjectPage}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>
        );
};

export default ProjectPageContainer;
