import { withIronSessionSsr } from "iron-session/next";
import type { NextPage } from "next";
import Head from "next/head";
import HomePageFooter from "../../../components/home/HomePageFooter";
import Navbar from "../../../components/navbar/Navbar";
import EditProjectContainer from "../../../components/projects/edit/EditProjectContainer";
import ProjectStatsContainer from "../../../components/projects/stats/ProjectStatsContainer";
import { sessionOptions } from "../../../src/lib/session";
import { getProjectFromId } from "../../../src/server/service/project-service";
import { Project, CookieUser } from "../../api/users";

type Props = {
    user: CookieUser;
    project: Project;
};

const redirectToHome = { redirect: { destination: "/" } };

const StatsProjectPage: NextPage<Props> = ({ user, project }: Props) => {
    return (
        <>
            <Head>
                <title>{project.title} - Statistics</title>
            </Head>
            <div className="main-container">
                <Navbar
                    activeButtons={{ isStatistics: true }}
                    project={project}
                />
                <ProjectStatsContainer project={project} />
                <HomePageFooter />
            </div>
        </>
    );
};

export const getServerSideProps = withIronSessionSsr(async function ({
    req,
    query,
}): Promise<any> {
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
},
sessionOptions);

export default StatsProjectPage;
