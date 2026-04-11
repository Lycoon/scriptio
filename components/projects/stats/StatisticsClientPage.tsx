"use client";

import { useContext } from "react";
import Loading from "@components/utils/Loading";
import { useCookieUser, useProjectMembership } from "@src/lib/utils/hooks";
import { ProjectContext } from "@src/context/ProjectContext";
import ProjectStatsContainer from "@components/projects/stats/ProjectStatsContainer";
import NoStatsContainer from "@components/projects/stats/NoStatsContainer";
import { Screenplay } from "@src/lib/utils/types";

const StatsWindow = (projectId: string, screenplay: Screenplay | null | undefined) => {
    if (screenplay) return <ProjectStatsContainer />;
    return <NoStatsContainer projectId={projectId} />;
};

export default function StatisticsClientPage() {
    const { user } = useCookieUser(true);
    const { membership, isLoading } = useProjectMembership();
    const { screenplay } = useContext(ProjectContext);

    if (!user || !membership || isLoading) {
        return <Loading />;
    }

    return StatsWindow(membership.project.id, screenplay);
}
