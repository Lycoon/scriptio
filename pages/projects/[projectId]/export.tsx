import type { NextPage } from "next";
import Head from "next/head";
import ExportProjectConainer from "@components/projects/export/ExportProjectContainer";
import NoExportContainer from "@components/projects/export/NoExportContainer";
import Loading from "@components/utils/Loading";
import { useProjectMembership, useUser } from "@src/lib/utils/hooks";
import { useContext } from "react";
import { ProjectContext } from "@src/context/ProjectContext";

const ExportProjectPage: NextPage = () => {
    const { user } = useUser(true);
    const { screenplay } = useContext(ProjectContext);
    const { membership, isLoading } = useProjectMembership();

    if (!user || !membership || isLoading) return <Loading />;

    return (
        <>
            <Head>
                <title>{membership.project.title + " • Export"}</title>
            </Head>
            {screenplay ? <ExportProjectConainer /> : <NoExportContainer projectId={membership.project.id} />}
        </>
    );
};

export default ExportProjectPage;
