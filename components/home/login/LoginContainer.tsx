"use client";

import LoginForm from "./LoginForm";
import layout from "../../utils/Layout.module.css";
import { useSearchParams, useRouter } from "next/navigation";
import { useCookieUser } from "@src/lib/utils/hooks";
import { useEffect } from "react";

export type AccountVerificationStatus = "success" | "failed" | "used" | null;

const LoginContainer = () => {
    const searchParams = useSearchParams();
    const status = searchParams.get("status") as AccountVerificationStatus;
    const email = searchParams.get("email");
    const { user, isLoading } = useCookieUser();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && user) router.push("/");
    }, [user, isLoading, router]);

    if (isLoading || user) return null;

    return (
        <>
            <div className={layout.center_middle}>
                <LoginForm status={status} email={email} />
            </div>
        </>
    );
};

export default LoginContainer;
