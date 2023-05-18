import { useEffect, useRef, useState } from "react";
import EmptyProjectPage from "./EmptyProjectPage";
import NewProjectPage from "./NewProjectPage";
import ProjectItem from "./ProjectItem";
import autoAnimate from "@formkit/auto-animate";
import Image from "next/image";
import { useProjects } from "../../src/lib/utils/hooks";
import Loading from "../home/Loading";
import { Project } from "../../src/lib/utils/types";
import { deleteProject } from "../../src/lib/utils/requests";

const ProjectPageContainer = () => {
    const { data: projects, isLoading, mutate } = useProjects();
    const [isCreating, setIsCreating] = useState(false);
    const [deleteMode, setDeleteMode] = useState(false);
    const parent = useRef(null);

    useEffect(() => {
        parent.current && autoAnimate(parent.current);
    }, [parent]);

    if (isLoading || !projects) return <Loading />;

    projects.sort((a: Project, b: Project) => {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    if (isCreating) {
        return <NewProjectPage setIsCreating={setIsCreating} />;
    } else if (projects.length === 0) {
        return <EmptyProjectPage setIsCreating={setIsCreating} />;
    } else {
        return (
            <div className="projects-container">
                <div className="center-flex">
                    <div className="projects-header">
                        <div className="projects-header-info">
                            <h1>Projects</h1>
                            <div className="projects-header-buttons">
                                <div
                                    onClick={() => setDeleteMode(!deleteMode)}
                                    className="delete-project-btn"
                                >
                                    <img
                                        className="delete-project-icon"
                                        src={"/images/trash.png"}
                                        alt={"Trash icon"}
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
                        {projects.map((project: Project) => {
                            return (
                                <ProjectItem
                                    key={project.id}
                                    project={project}
                                    deleteMode={deleteMode}
                                    deleteProject={() => {
                                        deleteProject(project.id);
                                        mutate!();
                                    }}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }
};

export default ProjectPageContainer;
