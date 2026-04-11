import { Metadata } from "next";
import { Suspense } from "react";
import DesktopOAuthComplete from "@components/home/desktop-oauth/DesktopOAuthComplete";

export const metadata: Metadata = {
    title: "Sign in | Scriptio®",
};

export default function DesktopOAuthCompletePage() {
    return (
        <Suspense>
            <DesktopOAuthComplete />
        </Suspense>
    );
}
