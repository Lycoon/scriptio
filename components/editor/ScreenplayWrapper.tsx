import ScreenplayAndSidebars from "./ScreenplayAndSidebars";
import { useSettings } from "@src/lib/utils/hooks";
import { useEffect, useState } from "react";
import { Project } from "@src/lib/utils/types";

import styles from "./ScreenplayWrapper.module.css";

type ScreenplayWrapperProps = {
    project: Project;
};

const ScreenplayWrapper = ({ project }: ScreenplayWrapperProps) => {
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
    }, [settings]);

    return (
        <div id={styles.container} className={settingsCSS}>
            <ScreenplayAndSidebars project={project} />
        </div>
    );
};

export default ScreenplayWrapper;
