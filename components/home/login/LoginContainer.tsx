"use client";

import LoginForm from "./LoginForm";
import layout from "../../utils/Layout.module.css";
import { useSearchParams } from "next/navigation";

const LoginContainer = () => {
    const searchParams = useSearchParams();
    const status = searchParams.get("status") as "success" | "failed" | "used" | null;

    return (
        <>
            <div className={layout.center_middle}>
                <LoginForm status={status} />
            </div>
        </>
    );
};

export default LoginContainer;
