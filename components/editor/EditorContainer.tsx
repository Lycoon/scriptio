import { Project, User } from "../../pages/api/users";
import EditorAndSidebar from "./EditorAndSidebar";

type Props = {
    user: User;
    project: Project;
};

const EditorContainer = ({ user, project }: Props) => {
    let settings = "";
    settings += user.settings.highlightOnHover ? "highlight-on-hover " : "";
    settings += user.settings.sceneBackground ? "scene-background " : "";

    return (
        <div id="editor-page" className={settings}>
            <EditorAndSidebar project={project} />
        </div>
    );
};

export default EditorContainer;
