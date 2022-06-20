import type { NextPage } from "next";
import Head from "next/head";
import HomePageFooter from "../components/home/HomePageFooter";
import Navbar from "../components/navbar/Navbar";
import RecoveryContainer from "../components/home/recovery/RecoveryContainer";

const RecoveryPage: NextPage = () => {
    return (
        <>
            <Head>
                <title>Scriptio - Recover password</title>
            </Head>
            <div className="main-container">
                <Navbar />
                <RecoveryContainer />
                <HomePageFooter />
            </div>
        </>
    );
};

export default RecoveryPage;
