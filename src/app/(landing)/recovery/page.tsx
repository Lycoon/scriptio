import { Metadata } from "next";
import RecoveryContainer from "@components/home/recovery/RecoveryContainer";

export const metadata: Metadata = {
    title: "Scriptio • Recover password",
};

export default function RecoveryPage({ id, token }: { id: string; token: string }) {
    return <RecoveryContainer userId={id} recoverHash={token} />;
}
