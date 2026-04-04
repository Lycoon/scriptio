"use client";

import { useEffect, useContext, Suspense } from "react";
import { useCookieUser } from "@src/lib/utils/hooks";
import HomePageContainer from "@components/home/HomePageContainer";
import Loading from "@components/utils/Loading";
import LandingPageNavbar from "@components/navbar/LandingPageNavbar";
import { isTauri } from "@tauri-apps/api/core";
import { useTheme } from "next-themes";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardContext } from "@src/context/DashboardContext";

const VERIFY_MESSAGES: Record<string, string> = {
    failed: "Verification link is invalid or has expired.",
    used: "This email address has already been verified.",
};

function RecoveryHandler() {
    const searchParams = useSearchParams();
    const { openDashboard } = useContext(DashboardContext);
    const id = searchParams.get("id");
    const code = searchParams.get("code");

    useEffect(() => {
        if (id && code) openDashboard("Login");
    }, [id, code, openDashboard]);

    return null;
}

function VerifyStatusBanner() {
    const searchParams = useSearchParams();
    const status = searchParams.get("verifyStatus");
    if (!status || !VERIFY_MESSAGES[status]) return null;

    const isError = status === "failed";
    return (
        <div style={{
            position: "fixed",
            top: "16px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            padding: "12px 24px",
            borderRadius: "8px",
            fontSize: "0.9rem",
            fontWeight: 500,
            whiteSpace: "nowrap",
            background: isError ? "rgba(239, 68, 68, 0.15)" : "rgba(59, 130, 246, 0.15)",
            color: isError ? "#ef4444" : "#3b82f6",
            border: `1px solid ${isError ? "rgba(239, 68, 68, 0.3)" : "rgba(59, 130, 246, 0.3)"}`,
            backdropFilter: "blur(8px)",
        }}>
            {VERIFY_MESSAGES[status]}
        </div>
    );
}

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
            <Suspense>
                <RecoveryHandler />
                <VerifyStatusBanner />
            </Suspense>
            <LandingPageNavbar />
            <HomePageContainer />
        </>
    );
}
