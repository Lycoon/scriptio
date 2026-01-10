import SignupContainer from "@components/home/signup/SignupContainer";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Scriptio • Sign up",
};

export default function SignupPage() {
    return <SignupContainer />;
}
