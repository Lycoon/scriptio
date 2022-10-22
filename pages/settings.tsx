import { withIronSessionSsr } from "iron-session/next";
import type { NextPage } from "next";
import Head from "next/head";
import Navbar from "../components/navbar/Navbar";
import SettingsPageContainer from "../components/settings/SettingsPageContainer";
import { sessionOptions } from "../src/lib/session";
import { clearNavbarProject } from "../src/lib/utils";
import { getUserFromId } from "../src/server/service/user-service";
import { User } from "./api/users";

type Props = {
    user: User;
};

const SettingsPage: NextPage<Props> = ({ user }: Props) => {
    clearNavbarProject();

    return (
        <>
            <Head>
                <title>Scriptio - Settings</title>
            </Head>
            <SettingsPageContainer user={user} />
        </>
    );
};

const noauth = { props: { user: null, projects: [] } };

export const getServerSideProps = withIronSessionSsr(async function ({
    req,
}): Promise<any> {
    const cookieUser = req.session.user;

    if (!cookieUser || !cookieUser.isLoggedIn) {
        return noauth;
    }

    const user = await getUserFromId(cookieUser.id);
    if (!user) {
        return noauth;
    }

    user.createdAt = user.createdAt.toISOString() as any as Date;

    return { props: { user } };
},
sessionOptions);

export default SettingsPage;
