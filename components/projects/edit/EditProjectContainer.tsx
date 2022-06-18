import Router from "next/router";
import { useState } from "react";
import { Project, User } from "../../../pages/api/users";
import FormError from "../../home/FormError";
import UploadButton from "../UploadButton";
import ProjectDangerZone from "./ProjectDangerZone";

type Props = {
    project: Project;
    user: User;
};

const EditProjectConainer = ({ project, user }: Props) => {
    const [errorMessage, setErrorMessage] = useState<string | undefined>(
        undefined
    );

    const onSubmit = async (e: any) => {
        e.preventDefault();
        setErrorMessage(undefined);

        const body = {
            projectId: project.id,
            title: e.target.title.value,
            description: e.target.description.value,
        };

        const res = await fetch(`/api/users/${user.id}/projects`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (res.status === 200) {
            Router.push(`/projects/${project.id}/editor`);
        } else {
            setErrorMessage(((await res.json()) as any).message);
        }
    };

    return (
        <div className="project-form-container">
            <form className="project-form" onSubmit={onSubmit}>
                <h1 className="segoe-bold">Edit project</h1>
                {errorMessage && <FormError message={errorMessage} />}

                <div>
                    <div className="form-element">
                        <span className="form-label">Title</span>
                        <input
                            id="project-title-input"
                            className="form-input"
                            name="title"
                            defaultValue={project.title}
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
                        />
                    </div>
                    <div className="form-element">
                        <span className="form-label">Poster</span>
                        <UploadButton />
                    </div>
                </div>

                <div className="project-form-end">
                    <button
                        className="form-btn back-btn"
                        onClick={() =>
                            Router.push(`/projects/${project.id}/editor`)
                        }
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
