import { useEffect } from "react";
import { Project, User } from "../../pages/api/users";
import EditorAndSidebar from "./EditorAndSidebar";

type Props = {
    user: User;
    project: Project;
};

const EditorContainer = ({ user, project }: Props) => {
    /* Configuring editor user settings */
    let settings = "";
    settings += user.settings.highlightOnHover ? "highlight-on-hover " : "";
    settings += user.settings.sceneBackground ? "scene-background " : "";
    useEffect(() => {
        document.documentElement.style.setProperty(
            "--editor-notes-color",
            user.settings.notesColor + "42" /* aplha channel */
        );
    });

    return (
        <div id="editor-page" className={settings}>
            <EditorAndSidebar project={project} />
        </div>
    );
};

export default EditorContainer;
