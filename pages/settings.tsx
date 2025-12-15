import type { NextPage } from "next";
import Head from "next/head";
import { useContext, useEffect } from "react";
import SettingsPageContainer from "@components/settings/SettingsPageContainer";
import { useUser } from "@src/lib/utils/hooks";
import { ProjectContext } from "@src/context/ProjectContext";

const SettingsPage: NextPage = () => {
    const { user } = useUser(true);
    const { updateProject } = useContext(ProjectContext);

    useEffect(() => updateProject(undefined), []);

    if (!user) return null;

    return (
        <>
            <Head>
                <title>Scriptio • Settings</title>
            </Head>
            <SettingsPageContainer />
        </>
    );
};

export default SettingsPage;
