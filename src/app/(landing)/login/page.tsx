import LoginContainer from "@components/home/login/LoginContainer";
import { Metadata } from "next";
import { EmailVerifyStatus } from "@src/lib/utils/enums";

export const metadata: Metadata = {
    title: "Scriptio • Log in",
};

export default function LoginPage({ status }: { status?: EmailVerifyStatus }) {
    return <LoginContainer status={status} />;
}
