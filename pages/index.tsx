import type { NextPage } from "next";
import Head from "next/head";
import HomePageContainer from "../components/home/HomePageContainer";
import HomePageFooter from "../components/home/HomePageFooter";
import HomePageNavbar from "../components/navbar/Navbar";
import useUser from "../src/lib/useUser";

const HomePage: NextPage = () => {
  const { user, mutateUser } = useUser();
  console.log("after useUser: ", user);

  return (
    <div>
      <Head>
        <title>Scriptio</title>
      </Head>
      <div className="main-container">
        <HomePageNavbar />
        {user && <HomePageContainer />}
        <HomePageFooter />
      </div>
    </div>
  );
};

export default HomePage;
