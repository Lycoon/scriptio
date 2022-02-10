import type { NextPage } from "next";
import Head from "next/head";
import HomePageContainer from "../components/HomePageContainer";
import HomePageFooter from "../components/HomePageFooter";
import HomePageNavbar from "../components/HomePageNavbar";

const HomePage: NextPage = () => {
  return (
    <div>
      <Head>
        <title>Scriptio</title>
      </Head>
      <div className="main-container">
        <HomePageNavbar />
        <HomePageContainer />
        <HomePageFooter />
      </div>
    </div>
  );
};

export default HomePage;
