"use client";

import { usePathname } from "next/navigation";
import LandingPageNavbar from "@components/navbar/LandingPageNavbar";

export default function LandingLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    return (
        <>
            {pathname !== "/recovery" && <LandingPageNavbar />}
            {children}
        </>
    );
}
