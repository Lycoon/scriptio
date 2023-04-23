import type { NextPage } from "next";
import Head from "next/head";
import { useContext, useEffect } from "react";
import HomePageContainer from "../components/home/HomePageContainer";
import Navbar from "../components/navbar/Navbar";
import ProjectPageContainer from "../components/projects/ProjectPageContainer";
import { UserContext } from "../src/context/UserContext";
import { useUser } from "../src/lib/utils/hooks";

const HomePage: NextPage = () => {
    const { updateProject } = useContext(UserContext);
    const { data: user } = useUser();

    useEffect(() => {
        updateProject(undefined);
    }, []);

    return (
        <>
            <Head>
                <title>{!user ? "Scriptio" : "Scriptio - Projects"}</title>
            </Head>
            {user && user.isLoggedIn ? (
                <>
                    <Navbar />
                    <ProjectPageContainer />
                </>
            ) : (
                <HomePageContainer />
            )}
        </>
    );
};

export default HomePage;
