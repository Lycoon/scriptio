import type { NextPage } from "next";
import Head from "next/head";
import EditProjectContainer from "@components/projects/edit/EditProjectContainer";
import Loading from "@components/utils/Loading";
import { useProjectMembership, useUser } from "@src/lib/utils/hooks";

const EditProjectPage: NextPage = () => {
    const { user } = useUser(true);
    const { membership, isLoading } = useProjectMembership();

    if (!membership || isLoading) return <Loading />;

    return (
        <>
            <Head>
                <title>{membership.project.title + " • Edit"}</title>
            </Head>
            <EditProjectContainer project={membership.project} />
        </>
    );
};

export default EditProjectPage;
