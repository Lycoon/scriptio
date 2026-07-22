"use client";

import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useRouter } from "next/navigation";

/**
 * The public homepage now lives in the standalone `landing/` app (static, served
 * by nginx). The main app keeps `/` only as a redirect hub for its own flows
 * (the unauthenticated bounce in useCookieUser, logout, the admin "home" link):
 *   - desktop (Tauri): there is no landing, go to the local workspace
 *   - web (prod): hand off to the static landing — Traefik serves `/` from there
 *   - web (dev): no landing runs locally, fall back to the workspace
 */
export default function HomeClient() {
    const router = useRouter();

    useEffect(() => {
        if (isTauri() || process.env.NODE_ENV !== "production") {
            router.replace("/projects");
        } else {
            window.location.replace("/");
        }
    }, [router]);

    return null;
}
