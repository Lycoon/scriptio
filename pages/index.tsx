import { withIronSessionSsr } from "iron-session/next";
import type { NextPage } from "next";
import Head from "next/head";
import HomePageContainer from "../components/home/HomePageContainer";
import HomePageFooter from "../components/home/HomePageFooter";
import HomePageNavbar from "../components/navbar/Navbar";
import ProjectPageContainer from "../components/projects/ProjectPageContainer";
import { sessionOptions } from "../src/lib/session";
import { User } from "./api/users";

const HomePage: NextPage<{ user: User }> = ({ user }) => {
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

export const getServerSideProps = withIronSessionSsr(async function ({
  req,
  res,
}) {
  const user = req.session.user;

  if (user === undefined) {
    /*res.setHeader("location", "/");
    res.statusCode = 302;
    res.end();*/

    return {
      props: {
        user: {
          isLoggedIn: false,
          email: "",
          id: -1,
        },
      },
    };
  }

  return {
    props: { user: req.session.user },
  };
},
sessionOptions);

export default HomePage;
