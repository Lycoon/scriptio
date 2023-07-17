import type { NextPage } from "next";
import Head from "next/head";
import Navbar from "@components/navbar/Navbar";
import EditProjectContainer from "@components/projects/edit/EditProjectContainer";
import Loading from "@components/utils/Loading";
import { useProjectFromUrl, useUser } from "@src/lib/utils/hooks";

const EditProjectPage: NextPage = () => {
    const { data: user } = useUser(true);
    const { data: project, isLoading } = useProjectFromUrl();

    if (!project || isLoading) return <Loading />;

    return (
        <>
            <Head>
                <title>{project.title} - Edit</title>
            </Head>
            <Navbar />
            <EditProjectContainer project={project} />
        </>
    );
};

export default EditProjectPage;
