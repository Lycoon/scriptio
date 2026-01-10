"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FormInfo, { FormInfoType } from "../../utils/FormInfo";
import { EmailVerifyStatus } from "@src/lib/utils/enums";
import { login } from "@src/lib/utils/requests";

import { useSWRConfig } from "swr";
import { ApiResponse } from "@src/lib/utils/api-utils";

import form from "../../utils/Form.module.css";
import { LoginBody } from "@src/app/api/login/route";
import { useRouter } from "next/navigation";

type Props = {
    status?: EmailVerifyStatus;
};

const LoginForm = ({ status }: Props) => {
    const router = useRouter();
    const [formInfo, setFormInfo] = useState<FormInfoType | null>(null);
    const { mutate } = useSWRConfig();

    useEffect(() => {
        switch (status) {
            case "failed":
                setFormInfo({
                    content: "An error occurred while verifying your account",
                    isError: true,
                });
                break;
            case "success":
                setFormInfo({
                    content: "Your account has been successfully verified",
                });
                break;
            case "used":
                setFormInfo({
                    content: "This email has already been registered",
                    isError: true,
                });
                break;
        }
    }, []);

    const resetFromInfo = () => {
        setFormInfo(null);
    };

    async function onSubmit(e: any) {
        e.preventDefault();

        const body: LoginBody = {
            email: e.target.email.value,
            password: e.target.password.value,
        };

        const res = await login(body);
        if (res.ok) {
            mutate("/api/users/cookie");
            router.push("/");
        } else {
            const json = (await res.json()) as ApiResponse;
            setFormInfo({ content: json.message!, isError: true });
        }
    }

    return (
        <form className={form.home} onSubmit={onSubmit}>
            <div className={form.header}>
                <h1>Log in</h1>
                <hr />
                {formInfo && <FormInfo info={formInfo} />}
            </div>

            <div className={form.element}>
                <label className={form.element}>
                    <span className={form.label}>Email</span>
                    <input className={form.input} name="email" type="email" onChange={resetFromInfo} required />
                </label>

                <label className={form.element}>
                    <span className={form.label}>Password</span>
                    <input className={form.input} name="password" type="password" onChange={resetFromInfo} required />
                    <Link href="/recovery">Forgot password?</Link>
                </label>
            </div>

            <div className={form.btn_flex}>
                <button className={form.btn} type="submit">
                    Log in
                </button>
            </div>
        </form>
    );
};

export default LoginForm;
