import type { NextPage } from "next";
import Head from "next/head";
import Navbar from "../components/navbar/Navbar";
import SignupContainer from "../components/home/signup/SignupContainer";

const SignupPage: NextPage = () => (
    <>
        <Head>
            <title>Scriptio - Sign up</title>
        </Head>
        <div className="main-container">
            <Navbar />
            <SignupContainer />
        </div>
    </>
);

export default SignupPage;
