import type { NextPage } from "next";
import Head from "next/head";
import Navbar from "../components/navbar/Navbar";
import RecoveryContainer from "../components/home/recovery/RecoveryContainer";

const RecoveryPage: NextPage = () => (
    <>
        <Head>
            <title>Scriptio - Recover password</title>
        </Head>
        <div className="main-container">
            <Navbar />
            <RecoveryContainer />
        </div>
    </>
);

export default RecoveryPage;
