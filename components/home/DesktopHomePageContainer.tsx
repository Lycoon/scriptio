import { useState } from "react";
import NewProjectPage from "../projects/CreateProjectPage";
import ProjectItemDesktop from "../projects/ProjectItemDesktop";
import Loading from "../utils/Loading";

import page_dk from "./DesktopHomePageContainer.module.css";
import page from "../projects/ProjectPageContainer.module.css";
import layout from "../utils/Layout.module.css";
import { useProjectMemberships } from "@src/lib/utils/hooks";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";

const onFileOpen = () => {
    console.log("File open");
};

const DesktopHomePageContainer = () => {
    const [isCreating, setIsCreating] = useState(false);
    const { projects, isLoading } = useProjectMemberships();

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
                        </div>
                    </div>
                    <hr />
                </div>
                <div className={page_dk.list}>
                    {projects &&
                        projects.map((membership: ProjectMembershipPayload) => {
                            return <ProjectItemDesktop key={membership.project.id} project={membership.project} />;
                        })}
                </div>
            </div>
        </div>
    );
};

export default DesktopHomePageContainer;
