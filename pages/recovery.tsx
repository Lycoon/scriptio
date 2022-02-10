import type { NextPage } from "next";
import Head from "next/head";
import HomePageFooter from "../components/HomePageFooter";
import HomePageNavbar from "../components/HomePageNavbar";
import RecoveryContainer from "../components/RecoveryContainer";

const RecoveryPage: NextPage = () => {
  return (
    <div>
      <Head>
        <title>Scriptio - Password recovery</title>
      </Head>
      <div className="main-container">
        <HomePageNavbar />
        <RecoveryContainer />
        <HomePageFooter />
      </div>
    </div>
  );
};

export default RecoveryPage;
