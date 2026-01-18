import { Metadata } from "next";
import RecoveryContainer from "@components/home/recovery/RecoveryContainer";

export const metadata: Metadata = {
    title: "Recover password | Scriptio",
};

export default function RecoveryPage() {
    return <RecoveryContainer />;
}
