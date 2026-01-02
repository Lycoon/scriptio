import Head from "next/head";
import type { NextPage } from "next";
import Loading from "@components/utils/Loading";
import { useProjectMembership, useSettings } from "@src/lib/utils/hooks";
import EditorAndSidebar from "@components/editor/EditorAndSidebar";

const EditorPage: NextPage = () => {
    const { membership } = useProjectMembership();
    const { settings } = useSettings();

    if (!membership) return <Loading />;

    return (
        <>
            <Head>
                <title>{membership.project.title + " • Scriptio"}</title>
            </Head>
            <EditorAndSidebar project={membership.project} />
        </>
    );
};

export default EditorPage;
