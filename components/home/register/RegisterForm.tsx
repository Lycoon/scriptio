import { useState } from "react";
import { ERROR_PASSWORD_MATCH } from "../../../src/lib/messages";
import { signup } from "../../../src/lib/requests";
import FormInfo, { FormInfoType } from "../FormInfo";

const RegisterForm = () => {
    const [formInfo, setFormInfo] = useState<FormInfoType | null>(null);

    const resetFromInfo = () => {
        setFormInfo(null);
    };

    async function onSubmit(e: any) {
        e.preventDefault();
        resetFromInfo();

        const email = e.target.email.value;
        const pwd1 = e.target.password1.value;
        const pwd2 = e.target.password2.value;

        if (pwd1 !== pwd2) {
            setFormInfo({ content: ERROR_PASSWORD_MATCH, isError: true });
            return;
        }

        const res = await signup(email, pwd1);
        const json = await res.json();

        if (res.status === 200 || res.status === 201) {
            setFormInfo({ content: json.message });
        } else {
            setFormInfo({ content: json.message, isError: true });
        }
    }

    return (
        <form className="home-form" onSubmit={onSubmit}>
            <div className="form-header">
                <h1>Register</h1>
                {formInfo && <FormInfo info={formInfo} />}
            </div>

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
                    name="password1"
                    type="password"
                    onChange={resetFromInfo}
                    required
                />
                <span className="form-label">Repeat password</span>
                <input
                    className="form-input"
                    name="password2"
                    type="password"
                    onChange={resetFromInfo}
                    required
                />
            </label>

            <div id="form-btn-flex">
                <button className="form-btn" type="submit">
                    Register
                </button>
            </div>
        </form>
    );
};

export default RegisterForm;
