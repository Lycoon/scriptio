import { Metadata } from "next";
import { Suspense } from "react";
import MagicLinkLanding from "@components/home/auth/MagicLinkLanding";

export const metadata: Metadata = {
    title: "Sign in | Scriptio®",
};

export default function MagicLinkPage() {
    return (
        <Suspense>
            <MagicLinkLanding />
        </Suspense>
    );
}
