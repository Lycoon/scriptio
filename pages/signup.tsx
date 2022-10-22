import type { NextPage } from "next";
import Head from "next/head";
import Navbar from "../components/navbar/Navbar";
import SignupContainer from "../components/home/signup/SignupContainer";
import { clearNavbarProject } from "../src/lib/utils";

const SignupPage: NextPage = () => {
    clearNavbarProject();

    return (
        <>
            <Head>
                <title>Scriptio - Sign up</title>
            </Head>
            <SignupContainer />
        </>
    );
};

export default SignupPage;
