import { withIronSessionSsr } from "iron-session/next";
import type { NextPage } from "next";
import Head from "next/head";
import Navbar from "../components/navbar/Navbar";
import SettingsPageContainer from "../components/settings/SettingsPageContainer";
import { User } from "./api/users";
import { sessionOptions } from "../src/lib/session";

type Props = {
    user: User;
};

const SettingsPage: NextPage<Props> = ({ user }: Props) => (
    <>
        <Head>
            <title>Scriptio - Settings</title>
        </Head>
        <div className="main-container">
            <Navbar />
            <SettingsPageContainer user={user} />
        </div>
    </>
);

const noauth = { props: { user: null, projects: [] } };

export const getServerSideProps = withIronSessionSsr(async function ({
    req,
}): Promise<any> {
    const user = req.session.user;

    if (!user || !user.isLoggedIn) {
        return noauth;
    }

    return { props: { user: user } };
},
sessionOptions);

export default SettingsPage;
