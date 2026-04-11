"use client";

import { usePathname } from "next/navigation";
import LandingPageNavbar from "@components/navbar/LandingPageNavbar";

const NAVBAR_HIDDEN_PREFIXES = ["/auth/magic-link", "/desktop-oauth"];

export default function LandingLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const hideNavbar = NAVBAR_HIDDEN_PREFIXES.some((prefix) => pathname?.startsWith(prefix));
    return (
        <>
            {!hideNavbar && <LandingPageNavbar />}
            {children}
        </>
    );
}
