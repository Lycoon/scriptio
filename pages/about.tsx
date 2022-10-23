import Head from "next/head";
import { useContext, useEffect } from "react";
import AboutPageContainer from "../components/home/AboutPageContainer";
import { UserContext } from "../src/context/UserContext";

const AboutPage = () => {
    const { updateProject } = useContext(UserContext);
    useEffect(() => updateProject(undefined), []);

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
