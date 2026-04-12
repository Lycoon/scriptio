"use client";

import { useEffect } from "react";
import HomePageContainer from "@components/home/HomePageContainer";
import Loading from "@components/utils/Loading";
import LandingPageNavbar from "@components/navbar/LandingPageNavbar";
import { isTauri } from "@tauri-apps/api/core";
import { useTheme } from "next-themes";

export default function HomeClient() {
    const { setTheme } = useTheme();

    useEffect(() => {
        if (!isTauri()) {
            setTheme("dark");
        }
    }, [setTheme]);

    if (isTauri()) {
        return <Loading />;
    }

    // Guest - show landing page with LandingPageNavbar
    return (
        <>
            <LandingPageNavbar />
            <HomePageContainer />
        </>
    );
}
