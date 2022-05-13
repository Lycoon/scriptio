import type { NextPage } from "next";
import Head from "next/head";
import { useEffect, useState } from "react";
import HomePageContainer from "../components/home/HomePageContainer";
import HomePageFooter from "../components/home/HomePageFooter";
import HomePageNavbar from "../components/navbar/Navbar";
import ProjectPageContainer from "../components/projects/ProjectPageContainer";
import useUser from "../src/lib/useUser";

const HomePage: NextPage = () => {
  const { user, mutateUser } = useUser();
  return (
    <div>
      <Head>
        <title>Scriptio</title>
      </Head>
      <div className="main-container">
        <HomePageNavbar user={user} />
        {!user?.isLoggedIn ? (
          <HomePageContainer />
        ) : (
          <ProjectPageContainer user={user} />
        )}
        <HomePageFooter />
      </div>
    </div>
  );
};

export default HomePage;
