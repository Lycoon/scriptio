import type { NextPage } from "next";
import Head from "next/head";
import Navbar from "@components/navbar/Navbar";
import NoStatsContainer from "@components/projects/stats/NoStatsContainer";
import ProjectStatsContainer from "@components/projects/stats/ProjectStatsContainer";
import Loading from "@components/utils/Loading";
import { useProjectFromUrl, useUser } from "@src/lib/utils/hooks";
import { Project } from "@src/lib/utils/types";

const StatsWindow = (project: Project | undefined) => {
    if (!project) return <Loading />;
    else if (project.screenplay) return <ProjectStatsContainer project={project} />;
    else return <NoStatsContainer projectId={project.id} />;
};

const StatsProjectPage: NextPage = () => {
    const { data: user } = useUser(true);
    const { data: project, isLoading } = useProjectFromUrl();

    return (
        <>
            <Head>
                <title>{project?.title} - Statistics</title>
            </Head>
            <Navbar />
            {StatsWindow(project)}
        </>
    );
};

export default StatsProjectPage;
