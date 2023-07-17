import Router from "next/router";
import FormInfo, { FormInfoType } from "../../utils/FormInfo";
import { useState } from "react";
import { ERROR_PASSWORD_MATCH } from "@src/lib/messages";
import { validateRecover } from "@src/lib/utils/requests";
import { join } from "@src/lib/utils/misc";

import form from "../../utils/Form.module.css";
import recovery from "../recovery/RecoveryForm.module.css";

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

        const pwd1 = e.target.pwd1.value;
        const pwd2 = e.target.pwd2.value;

        if (pwd1 !== pwd2) {
            setFormInfo({ content: ERROR_PASSWORD_MATCH, isError: true });
            return;
        }

        const res = await validateRecover(userId, recoverHash, pwd1);
        const json = await res.json();

        if (res.ok) {
            setFormInfo({ content: json.message });
            setTimeout(() => {
                Router.push("/login");
            }, 3000);
        } else {
            setFormInfo({ content: json.message, isError: true });
        }
    };

    return (
        <form className={form.home} onSubmit={onSubmit}>
            <div className={form.header}>
                <h1>Change password</h1>
                <hr />
                <p className={recovery.info}>
                    This is a secure space to change your password. Do not share the link of this page with anyone else.
                </p>
                {formInfo && <FormInfo info={formInfo} />}
            </div>
            <label className={form.element}>
                <span>New password</span>
                <input className={form.input} name="pwd1" type="password" required />
                <span>Repeat password</span>
                <input className={form.input} name="pwd2" type="password" required />
            </label>
            <div className={form.btn_flex}>
                <button className={form.btn} type="submit">
                    Confirm
                </button>
            </div>
        </form>
    );
};

export default PasswordChangeForm;
