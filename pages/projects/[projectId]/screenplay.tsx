import Head from "next/head";
import type { NextPage } from "next";
import EditorContainer from "../../../components/editor/EditorContainer";
import Navbar from "../../../components/navbar/Navbar";
import Loading from "../../../components/home/Loading";
import { useProjectFromUrl, useUser } from "../../../src/lib/utils/hooks";

const EditorPage: NextPage = () => {
    const { data: project, isLoading } = useProjectFromUrl();
    const { data: user } = useUser(true);

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
