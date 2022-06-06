import Router from "next/router";
import { Project, User } from "../../../pages/api/users";

type Props = {
  project: Project;
  user: User;
};

const ProjectDangerZone = ({ project, user }: Props) => {
  const onDelete = async (e: any) => {
    e.preventDefault();

    const title = e.target.danger.value;
    if (title !== project.title) {
      return;
    }

    const res = await fetch(`/api/users/${user.id}/projects`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });

    if (res.status === 200) {
      Router.push("/");
    } else {
      //setErrorMessage(((await res.json()) as any).message);
    }
  };

  return (
    <form id="danger-zone" onSubmit={onDelete}>
      <p className="danger-zone-text segoe-bold">Danger zone</p>
      <p className="danger-zone-info segoe">
        Type {project.title} below to confirm you want to delete the project.
        This action is irreversible.
      </p>
      <div className="danger-zone-actions">
        <input
          className="form-input danger-zone-input"
          name="danger"
          placeholder="Project title"
          required
        />
        <button id="delete-project-btn" className="form-btn" type="submit">
          Delete
        </button>
      </div>
    </form>
  );
};

export default ProjectDangerZone;
