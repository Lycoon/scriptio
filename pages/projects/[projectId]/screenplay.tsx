import Head from "next/head";
import type { NextPage } from "next";
import Loading from "@components/utils/Loading";
import { useProjectMembership, useSettings } from "@src/lib/utils/hooks";
import { useEffect, useState } from "react";
import EditorAndSidebar from "@components/editor/EditorAndSidebar";

const EditorPage: NextPage = () => {
    const { membership } = useProjectMembership();
    const { settings } = useSettings();
    const [settingsCSS, setSettingsCSS] = useState("");

    useEffect(() => {
        if (!membership || !settings) return;

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

    if (!membership) return <Loading />;

    return (
        <>
            <Head>
                <title>{membership.project.title + " • Scriptio"}</title>
            </Head>
            <EditorAndSidebar project={membership.project} css={settingsCSS} />
        </>
    );
};

export default EditorPage;
