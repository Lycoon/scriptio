import type { NextPage } from "next";
import Head from "next/head";
import HomePageFooter from "../components/home/HomePageFooter";
import HomePageNavbar from "../components/navbar/Navbar";
import LoginContainer from "../components/home/login/LoginContainer";

const LoginPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>Scriptio - Log in</title>
      </Head>
      <div className="main-container">
        <HomePageNavbar />
        <LoginContainer />
        <HomePageFooter />
      </div>
    </>
  );
};

export default LoginPage;
