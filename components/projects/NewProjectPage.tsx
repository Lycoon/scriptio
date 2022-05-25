import Router from "next/router";
import { useState } from "react";
import UploadButton from "./UploadButton";

const onSubmit = (setIsCreating: any) => {
  // Successful project creation
  setIsCreating(false);
};

const NewProjectPage = (props: any) => {
  const setIsCreating = props.setIsCreating;
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined
  );

  async function onSubmit(e: any) {
    e.preventDefault();
    setErrorMessage(undefined);

    const body = {
      title: e.target.title.value,
      description: e.target.description.value,
    };

    const res = await fetch("/api/users/" + "" + "/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 200) {
      Router.push("/");
    } else {
      setErrorMessage((await res.json()).message);
    }
  }

  return (
    <div id="new-project-page">
      <form id="new-project-form" onSubmit={() => onSubmit(setIsCreating)}>
        <h1 className="segoe-bold">New project</h1>
        <div id="email-form" className="form-element">
          <span className="form-label">Title</span>
          <input className="form-input" name="title" required />
          <span className="form-label">Description</span>
          <input className="form-input" name="description" />
          <span className="form-label">Poster</span>
          <UploadButton />
        </div>
        <div id="form-btn-flex">
          <button className="form-btn" type="submit">
            Create
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewProjectPage;
