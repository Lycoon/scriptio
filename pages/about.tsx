import Head from "next/head";
import AboutPageContainer from "../components/home/AboutPageContainer";
import Navbar from "../components/navbar/Navbar";
import { clearNavbarProject } from "../src/lib/utils";

const AboutPage = () => {
    clearNavbarProject();

    return (
        <>
            <Head>
                <title>Scriptio - About</title>
            </Head>
            <AboutPageContainer />
        </>
    );
};

export default AboutPage;
