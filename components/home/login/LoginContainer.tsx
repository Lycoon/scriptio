"use client";

import LoginForm from "./LoginForm";
import layout from "../../utils/Layout.module.css";
import { useSearchParams } from "next/navigation";

export type AccountVerificationStatus = "success" | "failed" | "used" | null;

const LoginContainer = () => {
    const searchParams = useSearchParams();
    const status = searchParams.get("status") as AccountVerificationStatus;
    const email = searchParams.get("email");

    return (
        <>
            <div className={layout.center_middle}>
                <LoginForm status={status} email={email} />
            </div>
        </>
    );
};

export default LoginContainer;
