import Link from "next/link";
import Router from "next/router";
import { useState } from "react";
import { getBase64 } from "../../../src/lib/utils/misc";
import { ProjectUpdate } from "../../../src/server/repository/project-repository";
import FormInfo, { FormInfoType } from "../../home/FormInfo";
import UploadButton from "../UploadButton";
import { Project } from "@prisma/client";
import { editProject } from "../../../src/lib/utils/requests";

type Props = {
    project: Project;
};

const EditProjectConainer = ({ project }: Props) => {
    const [formInfo, setFormInfo] = useState<FormInfoType | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

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

        const res = await editProject(body);
        const json = await res.json();

        if (res.status === 200) {
            Router.push(`/projects/${project.id}/screenplay`);
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
                        <span>Title</span>
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
                        <span>Description</span>
                        <textarea
                            id="project-description-input"
                            className="form-input input-description"
                            name="description"
                            defaultValue={project.description ?? undefined}
                            onChange={resetFromInfo}
                        />
                    </div>
                    <div className="form-element">
                        <span>Poster</span>
                        <UploadButton
                            setSelectedFile={setSelectedFile}
                            selectedFile={selectedFile}
                        />
                    </div>
                </div>

                <div className="project-form-end">
                    <Link legacyBehavior href={`/projects/${project.id}/screenplay`}>
                        <a className="form-btn back-btn">Back</a>
                    </Link>
                    <button className="form-btn project-form-submit-btn" type="submit">
                        Confirm
                    </button>
                </div>
            </form>
            {/*<ProjectDangerZone project={project} user={user} />*/}
        </div>
    );
};

export default EditProjectConainer;
