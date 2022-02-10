import type { NextPage } from "next";
import Head from "next/head";
import HomePageFooter from "../components/HomePageFooter";
import HomePageNavbar from "../components/HomePageNavbar";
import RegisterContainer from "../components/RegisterContainer";

const RegisterPage: NextPage = () => {
  return (
    <div>
      <Head>
        <title>Scriptio - Register</title>
      </Head>
      <div className="main-container">
        <HomePageNavbar />
        <RegisterContainer />
        <HomePageFooter />
      </div>
    </div>
  );
};

export default RegisterPage;
