import { useState } from "react";
import { ERROR_PASSWORD_MATCH } from "@src/lib/messages";
import { signup } from "@src/lib/utils/requests";
import FormInfo, { FormInfoType } from "../../utils/FormInfo";

import form from "../../utils/Form.module.css";
import { useRouter } from "@node_modules/next/router";

const SignupForm = () => {
    const [formInfo, setFormInfo] = useState<FormInfoType | null>(null);
    const { query } = useRouter();

    const resetFromInfo = () => {
        setFormInfo(null);
    };

    async function onSubmit(e: any) {
        e.preventDefault();
        resetFromInfo();

        const email = e.target.email.value;
        const pwd1 = e.target.pwd1.value;
        const pwd2 = e.target.pwd2.value;

        if (pwd1 !== pwd2) {
            setFormInfo({ content: ERROR_PASSWORD_MATCH, isError: true });
            return;
        }

        const res = await signup(email, pwd1, query.token as string);
        const json = await res.json();

        setFormInfo({ content: json.message, isError: !res.ok });
    }

    return (
        <form className={form.home} onSubmit={onSubmit}>
            <div className={form.header}>
                <h1>Sign up</h1>
                <hr />
                {formInfo && <FormInfo info={formInfo} />}
            </div>

            <label className={form.element}>
                <span>Email</span>
                <input
                    key={query.email as string}
                    className={form.input}
                    name="email"
                    type="email"
                    onChange={resetFromInfo}
                    defaultValue={query.email}
                    required
                />
            </label>

            <label className={form.element}>
                <span>Password</span>
                <input className={form.input} name="pwd1" type="password" onChange={resetFromInfo} required />
                <span>Repeat password</span>
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
