import { Metadata } from "next";
import { Suspense } from "react";
import DesktopAuthStart from "@components/home/desktop-auth/DesktopAuthStart";

export const metadata: Metadata = {
    title: "Sign in | Scriptio®",
};

export default function DesktopAuthStartPage() {
    return (
        <Suspense>
            <DesktopAuthStart />
        </Suspense>
    );
}
