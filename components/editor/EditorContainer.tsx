import EditorAndSidebar from "./EditorAndSidebar";
import { useSettings } from "@src/lib/utils/hooks";
import { useEffect, useState } from "react";
import { Project } from "@src/lib/utils/types";

import page from "./EditorContainer.module.css";

type Props = {
    project: Project;
};

const EditorContainer = ({ project }: Props) => {
    const { data: settings } = useSettings();
    const [settingsCSS, setSettingsCSS] = useState("");

    useEffect(() => {
        if (!settings) return;

        /* Configuring editor user settings */
        let settingsClass = "";
        settingsClass += settings.highlightOnHover ? "highlight-on-hover " : "";
        settingsClass += settings.sceneBackground ? "scene-background " : "";
        setSettingsCSS(settingsClass);

        document.documentElement.style.setProperty(
            "--editor-notes-color",
            settings.notesColor + "42" // 42 is for the alpha channel
        );

        console.log("Settings changed: ", settings.notesColor);
    }, [settings]);

    return (
        <div id={page.container} className={settingsCSS}>
            <EditorAndSidebar project={project} />
        </div>
    );
};

export default EditorContainer;
