"use client";

import { useEffect } from "react";
import HomePageContainer from "@components/home/HomePageContainer";
import LandingPageNavbar from "@components/navbar/LandingPageNavbar";
import { isTauri } from "@tauri-apps/api/core";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";

export default function HomeClient() {
    const { setTheme } = useTheme();
    const router = useRouter();

    useEffect(() => {
        if (isTauri()) {
            router.replace("/projects");
        } else {
            setTheme("dark");
        }
    }, [setTheme, router]);

    if (isTauri()) {
        return null;
    }

    // Guest - show landing page with LandingPageNavbar
    return (
        <>
            <LandingPageNavbar />
            <HomePageContainer />
        </>
    );
}
