import { useEffect, useRef, useState } from "react";
import { Project } from "../../pages/api/users";
import { deleteProject } from "../../src/lib/requests";
import EmptyProjectPage from "./EmptyProjectPage";
import NewProjectPage from "./NewProjectPage";
import ProjectItem from "./ProjectItem";
import autoAnimate from "@formkit/auto-animate";
import Image from "next/image";

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
    const parent = useRef(null);

    useEffect(() => {
        parent.current && autoAnimate(parent.current);
    }, [parent]);

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
            <div id="projects-container">
                <div className="center-flex">
                    <div className="projects-header">
                        <div className="projects-header-info">
                            <h1>Projects</h1>
                            <div className="projects-header-buttons">
                                <div
                                    onClick={() => setDeleteMode(!deleteMode)}
                                    className="delete-project-btn"
                                >
                                    <Image
                                        className="delete-project-icon"
                                        src={"/images/trash.png"}
                                        width={20}
                                        height={20}
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
                    <div ref={parent} className="project-grid">
                        {projs.map((project: Project) => {
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
