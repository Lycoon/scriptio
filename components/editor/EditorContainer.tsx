import { Project } from "../../pages/api/users";
import EditorAndSidebar from "./EditorAndSidebar";

type Props = {
    project: Project;
};

const EditorContainer = ({ project }: Props) => {
    return (
        <div id="editor-page">
            <EditorAndSidebar project={project} />
        </div>
    );
};

export default EditorContainer;
