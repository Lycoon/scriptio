import { withIronSessionSsr } from "iron-session/next";
import type { NextPage } from "next";
import Head from "next/head";
import { useContext, useEffect } from "react";
import HomePageContainer from "../components/home/HomePageContainer";
import ProjectPageContainer from "../components/projects/ProjectPageContainer";
import { UserContext } from "../src/context/UserContext";
import { sessionOptions } from "../src/lib/session";
import { getProjects } from "../src/server/service/project-service";
import { Project, CookieUser } from "./api/users";

type Props = {
    user: CookieUser | null;
    projects: Project[] | null;
};

const HomePage: NextPage<Props> = ({ user, projects }: Props) => {
    const ProjectPage = () => <ProjectPageContainer projects={projects!} />;
    const { updateProject } = useContext(UserContext);
    useEffect(() => updateProject(undefined), []);

    return (
        <>
            <Head>
                <title>{!user ? "Scriptio" : "Scriptio - Projects"}</title>
            </Head>
            {user && user.isLoggedIn ? <ProjectPage /> : <HomePageContainer />}
        </>
    );
};

const noauth = { props: { user: null, projects: [] } };
export const getServerSideProps = withIronSessionSsr(async function ({ req }): Promise<any> {
    const user = req.session.user;

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
}, sessionOptions);

export default HomePage;
