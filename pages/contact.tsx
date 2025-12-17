import Head from "next/head";
import { useContext, useEffect } from "react";
import { ProjectContext } from "@src/context/ProjectContext";

const ContactPage = () => {
    const { updateProject } = useContext(ProjectContext);
    useEffect(() => updateProject(undefined), []);

    return (
        <>
            <Head>
                <title>Scriptio • Contact</title>
            </Head>
        </>
    );
};

export default ContactPage;
