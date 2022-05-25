import { Project } from "@prisma/client";
import { withIronSessionSsr } from "iron-session/next";
import type { NextPage } from "next";
import Head from "next/head";
import HomePageContainer from "../components/home/HomePageContainer";
import HomePageFooter from "../components/home/HomePageFooter";
import HomePageNavbar from "../components/navbar/Navbar";
import ProjectPageContainer from "../components/projects/ProjectPageContainer";
import { sessionOptions } from "../src/lib/session";
import { getProjects } from "../src/server/service/project-service";
import { User } from "./api/users";

const HomePage: NextPage = ({ user, projects }: any) => {
  return (
    <>
      <Head>
        <title>Scriptio</title>
      </Head>
      <div className="main-container">
        <HomePageNavbar />
        {!user?.isLoggedIn ? (
          <HomePageContainer />
        ) : (
          <ProjectPageContainer projects={projects} />
        )}
        <HomePageFooter />
      </div>
    </>
  );
};

const unautheticated = {
  props: { user: null as any as User, projects: null as any as Project[] },
};

export const getServerSideProps = withIronSessionSsr(
  async function getServerSideProps({ req }) {
    const user = req.session.user;
    if (!user || !user.isLoggedIn) {
      return unautheticated;
    }

    const projects = await getProjects(user.id);
    if (!projects) {
      return unautheticated;
    }

    return {
      props: {
        user: req.session.user,
        projects: projects.projects,
      },
    };
  },
  sessionOptions
);

export default HomePage;
