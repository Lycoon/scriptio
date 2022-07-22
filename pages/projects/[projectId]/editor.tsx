import { withIronSessionSsr } from "iron-session/next";
import type { NextPage } from "next";
import Head from "next/head";
import { useState } from "react";
import EditorContainer from "../../../components/editor/EditorContainer";
import Navbar from "../../../components/navbar/Navbar";
import { sessionOptions } from "../../../src/lib/session";
import { getProjectFromId } from "../../../src/server/service/project-service";
import { getUserFromId } from "../../../src/server/service/user-service";
import { Project, User } from "../../api/users";

type Props = {
    user: User;
    project: Project;
};

const redirectToHome = { redirect: { destination: "/" } };

const EditorPage: NextPage<Props> = ({ user, project }: Props) => {
    const [isBlurred, setBlurred] = useState<boolean>(false);

    return (
        <>
            <Head>
                <link
                    rel="preconnect"
                    href="https://fonts.googleapis.com"
                ></link>
                <link
                    rel="preconnect"
                    href="https://fonts.gstatic.com"
                    crossOrigin="true"
                ></link>
                <link
                    href="https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400;1,700&display=swap"
                    rel="stylesheet"
                ></link>
                <title>{project.title}</title>
            </Head>
            <div className="main-container">
                <Navbar
                    activeButtons={{ isScreenplay: true }}
                    project={project}
                />
                <EditorContainer user={user} project={project} />
            </div>
        </>
    );
};

export const getServerSideProps = withIronSessionSsr(async function ({
    req,
    query,
}): Promise<any> {
    const projectId = +query["projectId"]!;
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
},
sessionOptions);

export default EditorPage;
