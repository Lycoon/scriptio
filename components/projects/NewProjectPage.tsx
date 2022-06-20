import Router from "next/router";
import { useState } from "react";
import useUser from "../../src/lib/useUser";
import { getBase64 } from "../../src/lib/utils";
import { ProjectCreation } from "../../src/server/repository/project-repository";
import FormError from "../home/FormError";
import UploadButton from "./UploadButton";

type Props = {
    setIsCreating: (isCreating: boolean) => void;
};

const NewProjectPage = ({ setIsCreating }: Props) => {
    const { user, setUser } = useUser();
    const [selectedFile, setSelectedFile] = useState<File | undefined>(
        undefined
    );
    const [errorMessage, setErrorMessage] = useState<string | undefined>(
        undefined
    );

    const onSubmit = async (e: any) => {
        e.preventDefault();
        setErrorMessage(undefined);

        const body: Partial<ProjectCreation> = {
            title: e.target.title.value,
            description: e.target.description.value,
        };

        if (selectedFile) {
            body.poster = await getBase64(selectedFile, 686, 1016);
        }

        const res = await fetch(`/api/users/${user?.id}/projects`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (res.status === 201) {
            Router.push("/");
            setIsCreating(false);
        } else {
            setErrorMessage(((await res.json()) as any).message);
        }
    };

    return (
        <div className="project-form-container">
            <form className="project-form" onSubmit={onSubmit}>
                <div>
                    <h1>New project</h1>
                    {errorMessage && <FormError message={errorMessage} />}
                    <hr />
                </div>

                <div>
                    <div className="form-element">
                        <span className="form-label">Title</span>
                        <input
                            id="project-title-input"
                            className="form-input"
                            name="title"
                            required
                        />
                        <span className="form-label">
                            Description - <i>optional</i>
                        </span>
                        <textarea
                            id="project-description-input"
                            className="form-input input-description"
                            name="description"
                        />
                        <span className="form-label">
                            Poster - <i>optional</i>
                        </span>
                        <UploadButton
                            setSelectedFile={setSelectedFile}
                            selectedFile={selectedFile}
                        />
                    </div>
                </div>

                <div className="project-form-end">
                    <button
                        className="form-btn back-btn"
                        onClick={() => setIsCreating(false)}
                    >
                        Back
                    </button>
                    <button
                        className="form-btn project-form-submit-btn"
                        type="submit"
                    >
                        Create
                    </button>
                </div>
            </form>
        </div>
    );
};

export default NewProjectPage;
