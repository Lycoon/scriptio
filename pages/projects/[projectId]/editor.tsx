import { withIronSessionSsr } from "iron-session/next";
import type { NextPage } from "next";
import Head from "next/head";
import { useState } from "react";
import EditorContainer from "../../../components/editor/EditorContainer";
import Navbar from "../../../components/navbar/Navbar";
import { sessionOptions } from "../../../src/lib/session";
import { getProjectFromId } from "../../../src/server/service/project-service";
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
        <title>{project.title}</title>
      </Head>
      <div className="main-container">
        <Navbar activeButtons={{ isScreenplay: true }} project={project} />
        <EditorContainer project={project!} />
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

  const user = req.session.user;
  const project = await getProjectFromId(projectId);
  if (!project || project.userId !== user?.id) {
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

export default EditorPage;
