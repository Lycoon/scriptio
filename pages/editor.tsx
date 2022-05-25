import { withIronSessionSsr } from "iron-session/next";
import type { NextPage } from "next";
import Head from "next/head";
import EditorContainer from "../components/editor/EditorContainer";
import HomePageNavbar from "../components/navbar/Navbar";
import { sessionOptions } from "../src/lib/session";
import { User } from "./api/users";

const EditorPage: NextPage<{ user: User }> = ({ user }) => {
  return (
    <>
      <Head>
        <title>Scriptio - Editor</title>
      </Head>
      <div className="main-container">
        <HomePageNavbar className="navbar" user={user} />
        <EditorContainer />
      </div>
    </>
  );
};

export const getServerSideProps = withIronSessionSsr(async function ({
  req,
  res,
}) {
  const user = req.session.user;

  if (user === undefined) {
    /*res.setHeader("location", "/");
    res.statusCode = 302;
    res.end();*/

    return {
      props: {
        user: {
          isLoggedIn: false,
          email: "",
          id: -1,
        },
      },
    };
  }

  return {
    props: { user: req.session.user },
  };
},
sessionOptions);

export default EditorPage;
