import { Project } from "@prisma/client";
import { withIronSessionSsr } from "iron-session/next";
import type { NextPage } from "next";
import Head from "next/head";
import useSWR from "swr";
import HomePageContainer from "../components/home/HomePageContainer";
import HomePageFooter from "../components/home/HomePageFooter";
import HomePageNavbar from "../components/navbar/Navbar";
import ProjectPageContainer from "../components/projects/ProjectPageContainer";
import { sessionOptions } from "../src/lib/session";
import { getProjects } from "../src/server/service/project-service";

const HomePage: NextPage = ({user, projects}: any) => {
  console.log(projects);

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

export const getServerSideProps = withIronSessionSsr(
  async function getServerSideProps({ req }) {
    const user = req.session.user;
    if (!user || !user.isLoggedIn)

    const projects: Project[] | undefined = (await getProjects(user?.id!))?.projects;

    return {
      props: {
        user: req.session.user,
        projects
      },
    };
  },
  sessionOptions
);

export default HomePage;
