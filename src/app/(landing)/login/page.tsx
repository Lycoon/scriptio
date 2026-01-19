import LoginContainer from "@components/home/login/LoginContainer";
import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
    title: "Log in | Scriptio",
};

export default function LoginPage() {
    return (
        <Suspense>
            <LoginContainer />
        </Suspense>
    );
}
