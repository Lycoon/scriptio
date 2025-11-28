import type { NextPage } from "next";
import Head from "next/head";
import { useContext, useEffect } from "react";
import HomePageContainer from "@components/home/HomePageContainer";
import Navbar from "@components/navbar/Navbar";
import ProjectPageContainer from "@components/projects/ProjectPageContainer";
import { useDesktop, useUser } from "@src/lib/utils/hooks";
import DesktopHomePageContainer from "@components/home/DesktopHomePageContainer";
import { ProjectContext } from "@src/context/ProjectContext";

const HomePageWindow = () => {
    const isDesktop = useDesktop();
    const { data: user, isLoading } = useUser();
    const { updateProject } = useContext(ProjectContext);

    useEffect(() => {
        updateProject(undefined);
    }, []);

    if (isLoading) return null;

    if (isDesktop) {
        return (
            <>
                <Navbar />
                <DesktopHomePageContainer />
            </>
        );
    }

    if (user) {
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
            <HomePageWindow />
        </>
    );
};

export default HomePage;
