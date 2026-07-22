import PrivacyContent from "@components/home/privacy/PrivacyContent";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Privacy Policy | Scriptio®",
};

export default function PrivacyPage() {
    return <PrivacyContent />;
}
