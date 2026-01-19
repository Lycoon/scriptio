import SignupContainer from "@components/home/signup/SignupContainer";
import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
    title: "Sign up | Scriptio",
};

export default function SignupPage() {
    return (
        <Suspense>
            <SignupContainer />
        </Suspense>
    );
}
