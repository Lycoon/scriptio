import Head from "next/head";
import type { NextPage } from "next";
import EditorContainer from "@components/editor/EditorContainer";
import Loading from "@components/utils/Loading";
import { useProjectFromUrl } from "@src/lib/utils/hooks";

const EditorPage: NextPage = () => {
    const { data: project } = useProjectFromUrl();

    if (!project) return <Loading />;

    return (
        <>
            <Head>
                <title>{project.title} • Scriptio</title>
            </Head>
            <EditorContainer project={project} />
        </>
    );
};

export default EditorPage;
