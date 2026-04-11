"use client";

import { useEffect } from "react";
import { useCookieUser } from "@src/lib/utils/hooks";
import HomePageContainer from "@components/home/HomePageContainer";
import Loading from "@components/utils/Loading";
import LandingPageNavbar from "@components/navbar/LandingPageNavbar";
import { isTauri } from "@tauri-apps/api/core";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";

export default function HomeClient() {
    const { user, isLoading } = useCookieUser();
    const { setTheme } = useTheme();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !user && !isTauri()) {
            setTheme("dark");
        }
    }, [user, isLoading, setTheme]);

    useEffect(() => {
        if (!isLoading && (user || isTauri())) {
            router.replace("/projects");
        }
    }, [user, isLoading, router]);

    if (isLoading || user || isTauri()) {
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
