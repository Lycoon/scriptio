import type { NextPage } from "next";
import Head from "next/head";
import HomePageContainer from "../components/home/HomePageContainer";
import HomePageFooter from "../components/home/HomePageFooter";
import HomePageNavbar from "../components/navbar/Navbar";
import ProjectPageContainer from "../components/projects/ProjectPageContainer";

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
