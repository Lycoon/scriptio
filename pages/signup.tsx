import type { NextPage } from "next";
import Head from "next/head";
import { useContext, useEffect } from "react";
import SignupContainer from "@components/home/signup/SignupContainer";
import { ProjectContext } from "@src/context/ProjectContext";

const SignupPage: NextPage = () => {
    const { updateProject } = useContext(ProjectContext);
    useEffect(() => updateProject(undefined), []);

    return (
        <>
            <Head>
                <title>Scriptio • Sign up</title>
            </Head>
            <SignupContainer />
        </>
    );
};

export default SignupPage;
