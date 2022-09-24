import type { NextPage } from "next";
import Head from "next/head";
import AboutPageContainer from "../components/home/AboutPageContainer";
import Navbar from "../components/navbar/Navbar";
import { User } from "./api/users";

const AboutPage = () => (
    <>
        <Head>
            <title>Scriptio - About</title>
        </Head>
        <div className="main-container">
            <Navbar />
            <AboutPageContainer />
        </div>
    </>
);

export default AboutPage;
