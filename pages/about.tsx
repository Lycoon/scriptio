import Head from "next/head";
import { useContext, useEffect } from "react";
import AboutPageContainer from "@components/home/AboutPageContainer";
import { ProjectContext } from "@src/context/ProjectContext";

const AboutPage = () => {
    const { updateProject } = useContext(ProjectContext);
    useEffect(() => updateProject(undefined), []);

    return (
        <>
            <Head>
                <title>Scriptio • About</title>
            </Head>
            <AboutPageContainer />
        </>
    );
};

export default AboutPage;
