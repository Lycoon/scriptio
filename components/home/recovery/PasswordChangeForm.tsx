import Router from "next/router";
import { useState } from "react";
import { ERROR_PASSWORD_MATCH } from "../../../src/lib/messages";
import { validateRecover } from "../../../src/lib/requests";
import FormInfo, { FormInfoType } from "../FormInfo";

type Props = {
    userId: number;
    recoverHash: string;
};

const PasswordChangeForm = ({ userId, recoverHash }: Props) => {
    const [formInfo, setFormInfo] = useState<FormInfoType | null>(null);
    const resetFromInfo = () => {
        setFormInfo(null);
    };

    const onSubmit = async (e: any) => {
        e.preventDefault();
        resetFromInfo();

        const pwd1 = e.target.password1.value;
        const pwd2 = e.target.password2.value;

        if (pwd1 !== pwd2) {
            setFormInfo({ content: ERROR_PASSWORD_MATCH, isError: true });
            return;
        }

        const res = await validateRecover(userId, recoverHash, pwd1);
        const json = await res.json();

        if (res.status === 200 || res.status === 201) {
            setFormInfo({ content: json.message });
            setTimeout(() => {
                Router.push("/login");
            }, 3000);
        } else {
            setFormInfo({ content: json.message, isError: true });
        }
    };

    return (
        <form className="home-form" onSubmit={onSubmit}>
            <div className="form-header">
                <h1>Change password</h1>
                <hr className="hr-form" />
                <p className="recovery-info segoe">
                    This is a secure page to change your password. Don't share
                    the link of this page with anyone else.
                </p>
                {formInfo && <FormInfo info={formInfo} />}
            </div>
            <label id="password-form" className="form-element">
                <span className="form-label">New password</span>
                <input
                    className="form-input"
                    name="password1"
                    type="password"
                    required
                />
                <span className="form-label">Repeat password</span>
                <input
                    className="form-input"
                    name="password2"
                    type="password"
                    required
                />
            </label>

            <div id="form-btn-flex">
                <button className="form-btn" type="submit">
                    Confirm
                </button>
            </div>
        </form>
    );
};

export default PasswordChangeForm;
