import Router from "next/router";
import { useState } from "react";
import { getBase64 } from "../../src/lib/utils/misc";
import { ProjectCreation } from "../../src/server/repository/project-repository";
import FormInfo, { FormInfoType } from "../home/FormInfo";
import UploadButton from "./UploadButton";
import { createProject } from "../../src/lib/utils/requests";

type Props = {
    setIsCreating: (isCreating: boolean) => void;
};

const NewProjectPage = ({ setIsCreating }: Props) => {
    const [formInfo, setFormInfo] = useState<FormInfoType | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | undefined>(undefined);

    const exitCreating = () => {
        setIsCreating(false);
    };

    const resetFormInfo = () => {
        setFormInfo(null);
    };

    const onSubmit = async (e: any) => {
        e.preventDefault();
        resetFormInfo();

        const body: Partial<ProjectCreation> = {
            title: e.target.title.value,
            description: e.target.description.value,
        };

        if (selectedFile) {
            body.poster = await getBase64(selectedFile, 686, 1016);
        }

        const res = await createProject(body);
        const json = await res.json();

        if (res.ok) {
            setIsCreating(false);
            Router.push(`/projects/${json.data.id}/screenplay`);
        } else {
            setFormInfo({ content: json.message, isError: true });
        }
    };

    return (
        <div className="project-form-container">
            <form className="project-form" onSubmit={onSubmit}>
                <div>
                    <h1>New project</h1>
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
                            onChange={resetFromInfo}
                            required
                        />
                        <span>
                            Description - <i>optional</i>
                        </span>
                        <textarea
                            id="project-description-input"
                            name="description"
                            className="form-input input-description"
                            onChange={resetFromInfo}
                        />
                        <span>
                            Poster - <i>optional</i>
                        </span>
                        <UploadButton
                            setSelectedFile={setSelectedFile}
                            selectedFile={selectedFile}
                        />
                    </div>
                </div>

                <div className="project-form-end">
                    <button className="form-btn back-btn" onClick={exitCreating}>
                        Back
                    </button>
                    <button className="form-btn project-form-submit-btn" type="submit">
                        Create
                    </button>
                </div>
            </form>
        </div>
    );
};

export default NewProjectPage;
