import Router from "next/router";
import { Project, CookieUser } from "../../../pages/api/users";
import { deleteProject } from "../../../src/lib/requests";

type Props = {
    project: Project;
    user: CookieUser;
};

const ProjectDangerZone = ({ project, user }: Props) => {
    const onDelete = async (e: any) => {
        e.preventDefault();

        const title = e.target.danger.value;
        if (title !== project.title) {
            e.target.danger.value = "";
            return;
        }

        const res = await deleteProject(user.id, project.id);
        if (res.status === 200) {
            Router.push("/");
        } else {
            //need to add error message
            //setErrorMessage(((await res.json()) as any).message);
        }
    };

    return (
        <form id="danger-zone" onSubmit={onDelete}>
            <p className="danger-zone-text segoe-bold">Danger zone</p>
            <p className="danger-zone-info segoe">
                Type{" "}
                <span className="danger-zone-project-title">
                    {project.title}
                </span>{" "}
                below to confirm you want to delete the project. This action is
                irreversible.
            </p>
            <div className="danger-zone-actions">
                <input
                    className="form-input danger-zone-input"
                    name="danger"
                    placeholder="Project title"
                    required
                />
                <button
                    id="delete-project-btn"
                    className="form-btn"
                    type="submit"
                >
                    Delete
                </button>
            </div>
        </form>
    );
};

export default ProjectDangerZone;
