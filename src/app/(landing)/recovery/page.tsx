import { Metadata } from "next";
import RecoveryContainer from "@components/home/recovery/RecoveryContainer";
import { Suspense } from "react";

export const metadata: Metadata = {
    title: "Recover password | Scriptio®",
};

export default function RecoveryPage() {
    return (
        <Suspense>
            <RecoveryContainer />
        </Suspense>
    );
}
