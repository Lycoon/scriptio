"use client";

import { useState } from "react";
import { ERROR_PASSWORD_MATCH } from "@src/lib/messages";
import { signup } from "@src/lib/utils/requests";
import FormInfo, { FormInfoType } from "../../utils/FormInfo";
import { ApiResponse } from "@src/lib/utils/api-utils";

import form from "../../utils/Form.module.css";
import { SignupBody } from "@src/lib/utils/api-bodies";
import { useRouter, useSearchParams } from "next/navigation";

const SignupForm = () => {
    const [formInfo, setFormInfo] = useState<FormInfoType | null>(null);
    const router = useRouter();
    const searchParams = useSearchParams();
    const inviteToken = searchParams.get("inviteToken");
    const emailParam = searchParams.get("email") ?? "";

    const resetFromInfo = () => {
        setFormInfo(null);
    };

    async function onSubmit(e: any) {
        e.preventDefault();

        const email = e.target.email.value;
        const pwd1 = e.target.pwd1.value;
        const pwd2 = e.target.pwd2.value;

        if (pwd1 !== pwd2) {
            setFormInfo({ content: ERROR_PASSWORD_MATCH, isError: true });
            return;
        }

        const body: SignupBody = {
            email,
            password: pwd1,
            inviteToken: inviteToken ?? undefined,
        };

        const res = await signup(body);
        const json = (await res.json()) as ApiResponse;

        if (res.ok && json.data && json.data.redirectUrl) {
            router.push(json.data.redirectUrl);
            return;
        }

        setFormInfo({ content: json.message!, isError: !res.ok });
    }

    return (
        <form className={form.home} onSubmit={onSubmit}>
            <div className={form.header}>
                <h1>Sign up</h1>
                <hr />
                {formInfo && <FormInfo info={formInfo} />}
            </div>

            <label className={form.element}>
                <span className={form.label}>Email</span>
                <input
                    key={emailParam}
                    className={form.input}
                    name="email"
                    type="email"
                    onChange={resetFromInfo}
                    defaultValue={emailParam}
                    required
                />
            </label>

            <label className={form.element}>
                <span className={form.label}>Password</span>
                <input className={form.input} name="pwd1" type="password" onChange={resetFromInfo} required />
                <span className={form.label}>Repeat password</span>
                <input className={form.input} name="pwd2" type="password" onChange={resetFromInfo} required />
            </label>

            <div className={form.btn_flex}>
                <button className={form.btn} type="submit">
                    Sign up
                </button>
            </div>
        </form>
    );
};

export default SignupForm;
