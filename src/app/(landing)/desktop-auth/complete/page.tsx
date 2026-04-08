import { Metadata } from "next";
import { Suspense } from "react";
import DesktopAuthComplete from "@components/home/desktop-auth/DesktopAuthComplete";

export const metadata: Metadata = {
    title: "Sign in | Scriptio®",
};

export default function DesktopAuthCompletePage() {
    return (
        <Suspense>
            <DesktopAuthComplete />
        </Suspense>
    );
}
