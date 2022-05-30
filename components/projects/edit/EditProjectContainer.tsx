import { Project } from "@prisma/client";
import Router from "next/router";
import { useEffect, useState } from "react";
import { User } from "../../../pages/api/users";
import useUser from "../../../src/lib/useUser";
import FormError from "../../home/FormError";
import UploadButton from "../UploadButton";

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
      setErrorMessage((await res.json()).message);
    }
  };

  return (
    <div id="new-project-page">
      <form id="new-project-form" onSubmit={onSubmit}>
        <h1 className="segoe-bold">Edit project</h1>
        {errorMessage && <FormError message={errorMessage} />}

        <div className="form-element">
          <span className="form-label">Title</span>
          <input
            className="form-input"
            name="title"
            defaultValue={project.title}
            required
          />
          <span className="form-label">Description</span>
          <textarea
            className="form-input input-description"
            name="description"
            defaultValue={project.description ?? undefined}
          />
          <span className="form-label">Poster</span>
          <UploadButton />
        </div>
        <div id="new-project-form-btn-flex">
          <a
            className="back-btn"
            onClick={() => Router.push(`/projects/${project.id}/editor`)}
          >
            Back
          </a>
          <button className="form-btn new-project-submit-btn" type="submit">
            Confirm
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditProjectConainer;
