import type { NextPage } from "next";
import Head from "next/head";
import HomePageFooter from "../components/HomePageFooter";
import HomePageNavbar from "../components/HomePageNavbar";
import LoginContainer from "../components/LoginContainer";

const LoginPage: NextPage = () => {
  return (
    <div>
      <Head>
        <title>Scriptio - Log in</title>
      </Head>
      <div className="main-container">
        <HomePageNavbar />
        <LoginContainer />
        <HomePageFooter />
      </div>
    </div>
  );
};

export default LoginPage;
