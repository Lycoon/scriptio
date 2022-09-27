import Head from "next/head";
import AboutPageContainer from "../components/home/AboutPageContainer";
import Navbar from "../components/navbar/Navbar";

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
