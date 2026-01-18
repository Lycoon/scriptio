import LoginContainer from "@components/home/login/LoginContainer";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Log in | Scriptio",
};

export default function LoginPage() {
    return <LoginContainer />;
}
