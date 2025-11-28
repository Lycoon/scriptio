import type { NextPage } from "next";
import Head from "next/head";
import { useContext, useEffect } from "react";
import Navbar from "@components/navbar/Navbar";
import SettingsPageContainer from "@components/settings/SettingsPageContainer";
import { useUser } from "@src/lib/utils/hooks";
import { ProjectContext } from "@src/context/ProjectContext";

const SettingsPage: NextPage = () => {
    const { data: user } = useUser(true);
    const { updateProject } = useContext(ProjectContext);

    useEffect(() => updateProject(undefined), []);

    return (
        <>
            <Head>
                <title>Scriptio - Settings</title>
            </Head>
            <Navbar />
            <SettingsPageContainer />
        </>
    );
};

export default SettingsPage;
