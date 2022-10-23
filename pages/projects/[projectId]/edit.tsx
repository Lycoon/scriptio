import { withIronSessionSsr } from "iron-session/next";
import type { NextPage } from "next";
import Head from "next/head";
import { useContext, useEffect } from "react";
import EditProjectContainer from "../../../components/projects/edit/EditProjectContainer";
import { UserContext } from "../../../src/context/UserContext";
import { sessionOptions } from "../../../src/lib/session";
import { getProjectFromId } from "../../../src/server/service/project-service";
import { Project, CookieUser } from "../../api/users";

type Props = {
    user: CookieUser;
    project: Project;
};

const EditProjectPage: NextPage<Props> = ({ user, project }: Props) => {
    const { updateProject } = useContext(UserContext);
    useEffect(() => updateProject(project), []);

    return (
        <>
            <Head>
                <title>{project.title} - Edit</title>
            </Head>
            <EditProjectContainer user={user} project={project} />
        </>
    );
};

const redirectToHome = { redirect: { destination: "/" } };
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

    // Workaround because dates can't be serialized
    project.createdAt = project.createdAt.toISOString() as any as Date;
    project.updatedAt = project.updatedAt.toISOString() as any as Date;

    return {
        props: { user: req.session.user, project },
    };
},
sessionOptions);

export default EditProjectPage;
