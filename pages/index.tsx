import type { NextPage } from "next";
import Head from "next/head";
import { useContext } from "react";
import HomePageContainer from "../components/home/HomePageContainer";
import HomePageFooter from "../components/home/HomePageFooter";
import HomePageNavbar from "../components/navbar/Navbar";
import ProjectPageContainer from "../components/projects/ProjectPageContainer";
import { UserContext } from "../src/context/UserContext";

const HomePage: NextPage = () => {
  const ctx = useContext(UserContext);
  const user = ctx.user;

  return (
    <div>
      <Head>
        <title>Scriptio</title>
      </Head>
      <div className="main-container">
        <HomePageNavbar />
        {!user?.isLoggedIn ? <HomePageContainer /> : <ProjectPageContainer />}
        <HomePageFooter />
      </div>
    </div>
  );
};

export default HomePage;
