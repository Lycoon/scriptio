import type { NextPage } from "next";
import Head from "next/head";
import HomePageFooter from "../components/home/HomePageFooter";
import Navbar from "../components/navbar/Navbar";
import RegisterContainer from "../components/home/register/RegisterContainer";

const RegisterPage: NextPage = () => {
    return (
        <>
            <Head>
                <title>Scriptio - Register</title>
            </Head>
            <div className="main-container">
                <Navbar />
                <RegisterContainer />
                <HomePageFooter />
            </div>
        </>
    );
};

export default RegisterPage;
