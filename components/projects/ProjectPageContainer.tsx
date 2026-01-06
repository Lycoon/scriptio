import { useEffect, useRef, useState } from "react";
import { useProjectMemberships } from "@src/lib/utils/hooks";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { join } from "@src/lib/utils/misc";

import EmptyProjectPage from "./EmptyProjectPage";
import NewProjectPage from "./CreateProjectPage";
import ProjectItem from "./ProjectItem";
import autoAnimate from "@formkit/auto-animate";
import Loading from "../utils/Loading";

import page from "./ProjectPageContainer.module.css";
import form from "../utils/Form.module.css";

const ProjectPageContainer = () => {
    const { projects, isLoading } = useProjectMemberships();
    const [isCreating, setIsCreating] = useState(false);
    const parent = useRef(null);

    useEffect(() => {
        parent.current && autoAnimate(parent.current);
    }, [parent]);

    if (isLoading || !projects) return <Loading />;

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
                                <button className={join(page.create_btn, form.btn)} onClick={() => setIsCreating(true)}>
                                    Create
                                </button>
                            </div>
                        </div>
                        <hr />
                    </div>
                    <div ref={parent} className={page.grid}>
                        {projects.map((membership: ProjectMembershipPayload) => {
                            return <ProjectItem key={membership.project.id} project={membership.project} />;
                        })}
                    </div>
                </div>
            </div>
        );
    }
};

export default ProjectPageContainer;
