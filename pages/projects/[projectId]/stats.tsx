import { withIronSessionSsr } from "iron-session/next";
import type { NextPage } from "next";
import Head from "next/head";
import { useContext, useEffect } from "react";
import Navbar from "../../../components/navbar/Navbar";
import NoStatsContainer from "../../../components/projects/stats/NoStatsContainer";
import ProjectStatsContainer from "../../../components/projects/stats/ProjectStatsContainer";
import { UserContext } from "../../../src/context/UserContext";
import { sessionOptions } from "../../../src/lib/session";
import { getProjectFromId } from "../../../src/server/service/project-service";
import { Project, CookieUser } from "../../api/users";

type Props = {
    user: CookieUser;
    project: Project;
};

const StatsProjectPage: NextPage<Props> = ({ project }: Props) => {
    const { updateProject } = useContext(UserContext);
    useEffect(() => updateProject(project), []);

    return (
        <>
            <Head>
                <title>{project.title} - Statistics</title>
            </Head>
            {project.screenplay ? (
                <>
                    <Navbar />
                    <ProjectStatsContainer project={project} />
                </>
            ) : (
                <NoStatsContainer projectId={project.id} />
            )}
        </>
    );
};

const redirectToHome = { redirect: { destination: "/" } };
export const getServerSideProps = withIronSessionSsr(async function ({ req, query }): Promise<any> {
    const projectId = +query["projectId"]!;
    if (!projectId) {
        return redirectToHome;
    }

    const user = req.session.user;
    const project = await getProjectFromId(projectId);
    if (!project || project.userId !== user?.id) {
        return redirectToHome;
    }

    // Workaround because dates can't be serialized
    project.createdAt = project.createdAt.toISOString() as any as Date;
    project.updatedAt = project.updatedAt.toISOString() as any as Date;

    return {
        props: { user: req.session.user, project },
    };
}, sessionOptions);

export default StatsProjectPage;
