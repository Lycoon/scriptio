import { useEffect, useRef, useState } from "react";
import EmptyProjectPage from "./EmptyProjectPage";
import NewProjectPage from "./CreateProjectPage";
import ProjectItem from "./ProjectItem";
import autoAnimate from "@formkit/auto-animate";
import { useProjects } from "@src/lib/utils/hooks";
import Loading from "../utils/Loading";
import { Project } from "@src/lib/utils/types";
import { deleteProject } from "@src/lib/utils/requests";
import { join } from "@src/lib/utils/misc";

import TrashSVG from "../../public/images/trash.svg";

import page from "./ProjectPageContainer.module.css";
import form from "../utils/Form.module.css";

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
            <div className={page.container}>
                <div className={page.center}>
                    <div className={page.header}>
                        <div className={page.header_info}>
                            <h1>Projects</h1>
                            <div className={page.header_btns}>
                                <div onClick={() => setDeleteMode(!deleteMode)} className={page.delete_btn}>
                                    <TrashSVG className={page.delete_img} alt="Trash icon" />
                                </div>
                                <button className={join(page.create_btn, form.btn)} onClick={() => setIsCreating(true)}>
                                    Create
                                </button>
                            </div>
                        </div>
                        <hr />
                    </div>
                    <div ref={parent} className={page.grid}>
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
