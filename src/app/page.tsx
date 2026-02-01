import { Metadata } from "next";
import HomeClient from "@components/home/HomeClient";

export const metadata: Metadata = {
    title: "Scriptio® | Screenwriting Software",
    description: "Modern, elegant and affordable screenwriting software.",
};

export default function HomePage() {
    return <HomeClient />;
}
