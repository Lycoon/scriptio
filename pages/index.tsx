import type { NextPage } from "next";
import Head from "next/head";
import { useContext } from "react";
import HomePageContainer from "../components/home/HomePageContainer";
import HomePageFooter from "../components/home/HomePageFooter";
import HomePageNavbar from "../components/navbar/Navbar";
import ProjectPageContainer from "../components/projects/ProjectPageContainer";
import { UserContext } from "../src/context/UserContext";
import { User } from "./api/users";

const HomePage: NextPage = () => {
  const { user, setUser } = useContext(UserContext);

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
