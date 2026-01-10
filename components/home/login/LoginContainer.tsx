"use client";

import { EmailVerifyStatus } from "@src/lib/utils/enums";
import LoginForm from "./LoginForm";

import layout from "../../utils/Layout.module.css";

type Props = {
    status?: EmailVerifyStatus;
};

const LoginContainer = ({ status }: Props) => {
    return (
        <>
            <div className={layout.center_middle}>
                <LoginForm status={status} />
            </div>
        </>
    );
};

export default LoginContainer;
