import type { NextPage } from "next";
import Head from "next/head";
import HomePageFooter from "../components/home/HomePageFooter";
import HomePageNavbar from "../components/navbar/Navbar";
import RegisterContainer from "../components/home/register/RegisterContainer";

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
