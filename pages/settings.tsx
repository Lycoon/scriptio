import type { NextPage } from "next";
import Head from "next/head";
import { useContext, useEffect } from "react";
import Navbar from "../components/navbar/Navbar";
import SettingsPageContainer from "../components/settings/SettingsPageContainer";
import { UserContext } from "../src/context/UserContext";
import { useUser } from "../src/lib/utils/hooks";

const SettingsPage: NextPage = () => {
    const { data: user } = useUser(true);
    const { updateProject } = useContext(UserContext);

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
