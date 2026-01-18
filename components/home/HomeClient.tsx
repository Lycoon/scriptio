"use client";

import { useEffect } from "react";
import { useCookieUser, useDesktop } from "@src/lib/utils/hooks";
import HomePageContainer from "@components/home/HomePageContainer";
import ProjectPageContainer from "@components/projects/ProjectPageContainer";
import DesktopHomePageContainer from "@components/home/DesktopHomePageContainer";
import Loading from "@components/utils/Loading";
import HomeNavbar from "@components/navbar/HomeNavbar";
import LandingPageNavbar from "@components/navbar/LandingPageNavbar";
import DashboardModal from "@components/dashboard/DashboardModal";

export default function HomeClient() {
    const isDesktop = useDesktop();
    const { user, isLoading } = useCookieUser();

    useEffect(() => {
        if (user) document.title = "Projects | Scriptio";
    }, [user]);

    if (isLoading) {
        return <Loading />;
    }

    // Desktop app
    if (isDesktop) {
        return (
            <>
                <HomeNavbar />
                <DesktopHomePageContainer />
                <DashboardModal />
            </>
        );
    }

    // Authenticated user - show projects with HomeNavbar
    if (user) {
        return (
            <>
                <HomeNavbar />
                <ProjectPageContainer />
                <DashboardModal />
            </>
        );
    }

    // Guest - show landing page with LandingPageNavbar
    return (
        <>
            <LandingPageNavbar />
            <HomePageContainer />
        </>
    );
}
