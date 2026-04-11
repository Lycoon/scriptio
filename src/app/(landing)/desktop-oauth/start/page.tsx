import { Metadata } from "next";
import { Suspense } from "react";
import DesktopOAuthStart from "@components/home/desktop-oauth/DesktopOAuthStart";

export const metadata: Metadata = {
    title: "Sign in | Scriptio®",
};

export default function DesktopOAuthStartPage() {
    return (
        <Suspense>
            <DesktopOAuthStart />
        </Suspense>
    );
}
