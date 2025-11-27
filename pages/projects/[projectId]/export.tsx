import type { NextPage } from "next";
import Head from "next/head";
import Navbar from "@components/navbar/Navbar";
import ExportProjectConainer from "@components/projects/export/ExportProjectContainer";
import NoExportContainer from "@components/projects/export/NoExportContainer";
import { useProjectFromUrl, useUser } from "@src/lib/utils/hooks";
import Loading from "@components/utils/Loading";

const ExportProjectPage: NextPage = () => {
    const { data: user } = useUser(true);
    const { data: project, isLoading, error } = useProjectFromUrl();

    if (!project || isLoading) return <Loading />;

    return (
        <>
            <Head>
                <title>{project.title} - Export</title>
            </Head>
            <Navbar />
            {project.screenplay ? (
                <ExportProjectConainer project={project} />
            ) : (
                <NoExportContainer projectId={project.id} />
            )}
        </>
    );
};

export default ExportProjectPage;
