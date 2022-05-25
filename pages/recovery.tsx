import type { NextPage } from "next";
import Head from "next/head";
import HomePageFooter from "../components/home/HomePageFooter";
import HomePageNavbar from "../components/navbar/Navbar";
import RecoveryContainer from "../components/home/recovery/RecoveryContainer";

const RecoveryPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>Scriptio - Password recovery</title>
      </Head>
      <div className="main-container">
        <HomePageNavbar />
        <RecoveryContainer />
        <HomePageFooter />
      </div>
    </>
  );
};

export default RecoveryPage;
