import Head from "next/head";
import type { NextPage } from "next";
import EditorContainer from "@components/editor/EditorContainer";
import Navbar from "@components/navbar/Navbar";
import Loading from "@components/utils/Loading";
import { useProjectFromUrl, useUser } from "@src/lib/utils/hooks";

const EditorPage: NextPage = () => {
    const { data: user } = useUser(true);
    const { data: project, isLoading } = useProjectFromUrl();

    return (
        <>
            <Head>
                <title>{project?.title}</title>
            </Head>
            <Navbar />
            {project ? <EditorContainer project={project} /> : <Loading />}
        </>
    );
};

export default EditorPage;
