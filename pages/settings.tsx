import type { NextPage } from "next";
import Head from "next/head";
import Navbar from "../components/navbar/Navbar";
import SettingsPageContainer from "../components/settings/SettingsPageContainer";

const SettingsPage: NextPage = () => (
    <>
        <Head>
            <title>Scriptio - Settings</title>
        </Head>
        <div className="main-container">
            <Navbar />
            <SettingsPageContainer />
        </div>
    </>
);

export default SettingsPage;
