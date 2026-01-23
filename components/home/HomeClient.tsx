"use client";

import { useEffect } from "react";
import { useCookieUser } from "@src/lib/utils/hooks";
import HomePageContainer from "@components/home/HomePageContainer";
import ProjectPageContainer from "@components/projects/ProjectPageContainer";
import Loading from "@components/utils/Loading";
import HomeNavbar from "@components/navbar/HomeNavbar";
import LandingPageNavbar from "@components/navbar/LandingPageNavbar";
import DashboardModal from "@components/dashboard/DashboardModal";
import { isTauri } from "@tauri-apps/api/core";

export default function HomeClient() {
    const { user, isLoading } = useCookieUser();

    useEffect(() => {
        if (user) document.title = "Projects | Scriptio";
    }, [user]);

    if (isLoading) {
        return <Loading />;
    }

    // Desktop app - always show projects page (offline-first, no landing page)
    if (isTauri()) {
        return (
            <>
                <HomeNavbar />
                <ProjectPageContainer />
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
