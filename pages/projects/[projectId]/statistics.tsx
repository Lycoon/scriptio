import type { NextPage } from "next";
import Head from "next/head";
import Loading from "@components/utils/Loading";
import { useProjectMembership, useUser } from "@src/lib/utils/hooks";
import { useContext } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { Screenplay } from "@src/lib/utils/types";
import ProjectStatsContainer from "@components/projects/stats/ProjectStatsContainer";
import NoStatsContainer from "@components/projects/stats/NoStatsContainer";

const StatsWindow = (projectId: string, screenplay: Screenplay) => {
    if (screenplay) return <ProjectStatsContainer />;
    else return <NoStatsContainer projectId={projectId} />;
};

const StatsProjectPage: NextPage = () => {
    const { user } = useUser(true);
    const { membership, isLoading } = useProjectMembership();
    const { screenplay } = useContext(ProjectContext);

    if (!user || !membership || isLoading) return <Loading />;

    return (
        <>
            <Head>
                <title>{membership.project.title + " • Statistics"}</title>
            </Head>
            {StatsWindow(membership.project.id, screenplay)}
        </>
    );
};

export default StatsProjectPage;
