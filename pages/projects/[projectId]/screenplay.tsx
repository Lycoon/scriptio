import { withIronSessionSsr } from "iron-session/next";
import type { NextPage } from "next";
import Head from "next/head";
import { useContext, useEffect } from "react";
import EditorContainer from "../../../components/editor/EditorContainer";
import Navbar from "../../../components/navbar/Navbar";
import { UserContext } from "../../../src/context/UserContext";
import { sessionOptions } from "../../../src/lib/session";
import { getProjectFromId } from "../../../src/server/service/project-service";
import { getUserFromId } from "../../../src/server/service/user-service";
import { Project, User } from "../../api/users";

type Props = {
    user: User;
    project: Project;
};

const EditorPage: NextPage<Props> = ({ user, project }: Props) => {
    const { updateProject } = useContext(UserContext);
    useEffect(() => updateProject(project), []);

    return (
        <>
            <Head>
                <title>{project.title}</title>
            </Head>
            <Navbar />
            <EditorContainer user={user} project={project} />
        </>
    );
};

const redirectToHome = { redirect: { destination: "/" } };
export const getServerSideProps = withIronSessionSsr(async function ({ req, query }): Promise<any> {
    const projectId = query["projectId"] as string;
    if (!projectId) {
        return redirectToHome;
    }

    const cookieUser = req.session.user;
    if (!cookieUser || !cookieUser.isLoggedIn) {
        return redirectToHome;
    }

    const project = await getProjectFromId(projectId);
    if (!project || project.userId !== cookieUser?.id) {
        return redirectToHome;
    }

    const user = await getUserFromId(cookieUser.id);
    if (!user) {
        return redirectToHome;
    }

    // Workaround because dates can't be serialized
    user.createdAt = user.createdAt.toISOString() as any as Date;
    project.createdAt = project.createdAt.toISOString() as any as Date;
    project.updatedAt = project.updatedAt.toISOString() as any as Date;

    return {
        props: { user, project },
    };
}, sessionOptions);

export default EditorPage;
