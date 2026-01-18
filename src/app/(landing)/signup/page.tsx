import SignupContainer from "@components/home/signup/SignupContainer";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Sign up | Scriptio",
};

export default function SignupPage() {
    return <SignupContainer />;
}
