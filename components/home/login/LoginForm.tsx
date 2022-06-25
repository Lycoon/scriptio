import Link from "next/link";
import Router from "next/router";
import { useContext, useState } from "react";
import { UserContext } from "../../../src/context/UserContext";
import FormInfo, { FormInfoType } from "../FormInfo";

const LoginForm = () => {
    const { user, updateUser } = useContext(UserContext);
    const [formInfo, setFormInfo] = useState<FormInfoType | null>(null);

    const resetFromInfo = () => {
        setFormInfo(null);
    };

    async function onSubmit(e: any) {
        e.preventDefault();
        resetFromInfo();

        const body = {
            email: e.target.email.value,
            password: e.target.password.value,
        };

        const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        const json = (await res.json()) as any;
        const resBody = json.body;

        if (res.status === 200) {
            updateUser(resBody);
            Router.push("/");
        } else {
            setFormInfo({ content: json.message, isError: true });
        }
    }

    return (
        <form className="home-form" onSubmit={onSubmit}>
            <div className="form-header">
                <h1>Log in</h1>
                {formInfo && <FormInfo info={formInfo} />}
            </div>

            <div className="form-element">
                <label id="email-form" className="form-element">
                    <span className="form-label">Email</span>
                    <input
                        className="form-input"
                        name="email"
                        type="email"
                        onChange={resetFromInfo}
                        required
                    />
                </label>

                <label id="password-form" className="form-element">
                    <span className="form-label">Password</span>
                    <input
                        className="form-input"
                        name="password"
                        type="password"
                        onChange={resetFromInfo}
                        required
                    />
                    <Link href="/recovery">Forgot password?</Link>
                </label>
            </div>

            <div id="form-btn-flex">
                <button className="form-btn" type="submit">
                    Log in
                </button>
            </div>
        </form>
    );
};

export default LoginForm;
