import Head from "next/head";
import { useContext, useEffect } from "react";
import { UserContext } from "@src/context/UserContext";

const ContactPage = () => {
    const { updateProject } = useContext(UserContext);
    useEffect(() => updateProject(undefined), []);

    return (
        <>
            <Head>
                <title>Scriptio - Contact</title>
            </Head>
        </>
    );
};

export default ContactPage;
