"use client";

import SignupForm from "./SignupForm";

import layout from "../../utils/Layout.module.css";
import { useCookieUser } from "@src/lib/utils/hooks";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const SignupContainer = () => {
    const { user, isLoading } = useCookieUser();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && user) router.push("/");
    }, [user, isLoading, router]);

    if (isLoading || user) return null;

    return (
        <>
            <div className={layout.center_middle}>
                <SignupForm />
            </div>
        </>
    );
};

export default SignupContainer;
