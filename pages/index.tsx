import type { NextPage } from "next";
import Head from "next/head";
import { useContext, useEffect, useState } from "react";
import HomePageContainer from "../components/home/HomePageContainer";
import Navbar from "../components/navbar/Navbar";
import ProjectPageContainer from "../components/projects/ProjectPageContainer";
import { UserContext } from "../src/context/UserContext";
import { useDesktop, useUser } from "../src/lib/utils/hooks";
import { CookieUser } from "../src/lib/utils/types";
import DesktopHomePageContainer from "../components/home/DesktopHomePageContainer";

type Props = {
    user: CookieUser | undefined;
};

const HomePageWindow = ({ user }: Props) => {
    const isDesktop = useDesktop();
    if (isDesktop) return <DesktopHomePageContainer />;

    if (user?.isLoggedIn) {
        return (
            <>
                <Navbar />
                <ProjectPageContainer />
            </>
        );
    } else {
        return <HomePageContainer />;
    }
};

const HomePage: NextPage = () => {
    const { data: user } = useUser();
    return (
        <>
            <Head>
                <title>{!user ? "Scriptio" : "Scriptio - Projects"}</title>
            </Head>
            <HomePageWindow user={user} />
        </>
    );
};

export default HomePage;
