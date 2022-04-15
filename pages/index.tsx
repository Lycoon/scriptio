import type { NextPage } from "next";
import Head from "next/head";
import HomePageContainer from "../components/home/HomePageContainer";
import HomePageFooter from "../components/home/HomePageFooter";
import HomePageNavbar from "../components/navbar/Navbar";
import { useUser } from "../src/lib/hooks";

const HomePage: NextPage = () => {
  const user = useUser();

  return (
    <div>
      <Head>
        <title>Scriptio</title>
      </Head>
      <div className="main-container">
        <HomePageNavbar />
        {user && <h1>LOGGED IN {JSON.stringify(user, null, 2)}</h1>}
        <HomePageContainer />
        <HomePageFooter />
      </div>
    </div>
  );
};

export default HomePage;
