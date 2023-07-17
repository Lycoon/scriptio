import { useState } from "react";
import NewProjectPage from "../projects/CreateProjectPage";
import ProjectItemDesktop from "../projects/ProjectItemDesktop";
import { useProjects } from "@src/lib/utils/hooks";
import { Project } from "@src/lib/utils/types";
import Loading from "../utils/Loading";

import page_dk from "./DesktopHomePageContainer.module.css";
import page from "../projects/ProjectPageContainer.module.css";
import layout from "../utils/Layout.module.css";

const onFileOpen = () => {
    console.log("File open");
};

const DesktopHomePageContainer = () => {
    const [deleteMode, setDeleteMode] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const { data: projects, isLoading } = useProjects();

    if (isLoading) return <Loading />;
    if (isCreating) return <NewProjectPage setIsCreating={setIsCreating} />;
    return (
        <div className={layout.center_col}>
            <div className={layout.center_content}>
                <div className={page.header}>
                    <div className={page.header_info}>
                        <h1>Projects</h1>
                        <div className={page.header_btns}>
                            <button className={page.create_btn + " form-btn"} onClick={() => setIsCreating(true)}>
                                Create
                            </button>
                            <button className={page.create_btn + " form-btn"} onClick={onFileOpen}>
                                Open...
                            </button>
                            <div onClick={() => setDeleteMode(!deleteMode)} className={page.delete_btn}>
                                <img className={page.delete_img} src={"/images/trash.png"} alt={"Trash icon"} />
                            </div>
                        </div>
                    </div>
                    <hr />
                </div>
                <div className={page_dk.list}>
                    {projects &&
                        projects.map((project: Project) => {
                            return (
                                <ProjectItemDesktop
                                    key={project.id}
                                    project={project}
                                    deleteMode={deleteMode}
                                    deleteProject={() => {}}
                                />
                            );
                        })}
                </div>
            </div>
        </div>
    );
};

export default DesktopHomePageContainer;
