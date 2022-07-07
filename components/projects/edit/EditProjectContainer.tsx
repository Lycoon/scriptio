import Router from "next/router";
import { useState } from "react";
import { Project, User } from "../../../pages/api/users";
import { editProject } from "../../../src/lib/requests";
import { getBase64 } from "../../../src/lib/utils";
import { ProjectUpdate } from "../../../src/server/repository/project-repository";
import FormInfo, { FormInfoType } from "../../home/FormInfo";
import UploadButton from "../UploadButton";
import ProjectDangerZone from "./ProjectDangerZone";

type Props = {
    project: Project;
    user: User;
};

const EditProjectConainer = ({ project, user }: Props) => {
    const [formInfo, setFormInfo] = useState<FormInfoType | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const backToScreenplay = () => {
        Router.push(`/projects/${project.id}/editor`);
    };

    const resetFromInfo = () => {
        setFormInfo(null);
    };

    const onSubmit = async (e: any) => {
        e.preventDefault();

        const body: ProjectUpdate = {
            projectId: project.id,
            title: e.target.title.value,
            description: e.target.description.value,
        };

        if (selectedFile) {
            body.poster = await getBase64(selectedFile, 686, 1016);
        }

        const res = await editProject(user.id, body);
        const json = await res.json();

        if (res.status === 200) {
            Router.push(`/projects/${project.id}/editor`);
        } else {
            setFormInfo({ content: json.message, isError: true });
        }
    };

    return (
        <div className="project-form-container">
            <form className="project-form" onSubmit={onSubmit}>
                <div>
                    <h1>Edit project</h1>
                    <hr />
                    {formInfo && <FormInfo info={formInfo} />}
                </div>

                <div>
                    <div className="form-element">
                        <span className="form-label">Title</span>
                        <input
                            id="project-title-input"
                            name="title"
                            className="form-input"
                            defaultValue={project.title}
                            onChange={resetFromInfo}
                            required
                        />
                    </div>
                    <div className="form-element">
                        <span className="form-label">Description</span>
                        <textarea
                            id="project-description-input"
                            className="form-input input-description"
                            name="description"
                            defaultValue={project.description ?? undefined}
                            onChange={resetFromInfo}
                        />
                    </div>
                    <div className="form-element">
                        <span className="form-label">Poster</span>
                        <UploadButton
                            setSelectedFile={setSelectedFile}
                            selectedFile={selectedFile}
                        />
                    </div>
                </div>

                <div className="project-form-end">
                    <button
                        className="form-btn back-btn"
                        onClick={backToScreenplay}
                    >
                        Back
                    </button>
                    <button
                        className="form-btn project-form-submit-btn"
                        type="submit"
                    >
                        Confirm
                    </button>
                </div>
            </form>
            <ProjectDangerZone project={project} user={user} />
        </div>
    );
};

export default EditProjectConainer;
