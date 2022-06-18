import { Project } from "@prisma/client";
import { withIronSessionSsr } from "iron-session/next";
import type { NextPage } from "next";
import Head from "next/head";
import HomePageContainer from "../components/home/HomePageContainer";
import HomePageFooter from "../components/home/HomePageFooter";
import Navbar from "../components/navbar/Navbar";
import ProjectPageContainer from "../components/projects/ProjectPageContainer";
import { sessionOptions } from "../src/lib/session";
import { getProjects } from "../src/server/service/project-service";
import { User } from "./api/users";

type Props = {
    user: User | null;
    projects: Project[] | null;
};

const HomePage: NextPage<Props> = ({ user, projects }: Props) => {
    return (
        <>
            <Head>
                <title>{!user ? "Scriptio" : "Scriptio - Projects"}</title>
            </Head>
            <div className="main-container">
                <Navbar />
                {!user ? (
                    <>
                        <HomePageContainer />
                        <HomePageFooter />
                    </>
                ) : (
                    <ProjectPageContainer projects={projects!} />
                )}
            </div>
        </>
    );
};

const noauth = { props: { user: null, projects: [] } };

export const getServerSideProps = withIronSessionSsr(
    async function getServerSideProps({ req }): Promise<any> {
        const user = req.session.user;

        console.log("req.session home: ", req.session);
        console.log("home user: ", user);

        if (!user || !user.isLoggedIn) {
            return noauth;
        }

        const projects = await getProjects(user.id);
        if (!projects) {
            return noauth;
        }

        // Workaround because dates can't be serialized
        projects.projects = projects.projects.map((e) => {
            return {
                ...e,
                updatedAt: e.updatedAt.toISOString() as any as Date,
                createdAt: e.createdAt.toISOString() as any as Date,
            };
        });

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
