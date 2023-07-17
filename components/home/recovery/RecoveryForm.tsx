import Link from "next/link";
import { useState } from "react";
import { sendRecover } from "@src/lib/utils/requests";
import { join } from "@src/lib/utils/misc";

import form from "../../utils/Form.module.css";
import recovery from "./RecoveryForm.module.css";

const RecoveryForm = () => {
    const [sentEmail, setSetSentEmail] = useState(false);

    const onSubmit = async (e: any) => {
        e.preventDefault();

        const email: string = e.target.email.value;
        sendRecover(email);
        setSetSentEmail(true);
    };

    return (
        <form className={form.home} onSubmit={onSubmit}>
            <div className={form.header}>
                <h1>Recover</h1>
                <hr />
                <p className={join(recovery.info, "segoe")}>
                    If the provided email is linked to an existing account, an email will be sent with a link to recover
                    your password.
                </p>
                {sentEmail && (
                    <p className={join(recovery.info, "segoe")}>
                        The email can take few minutes to arrive. Please check your junk folder if you do not receive
                        it.
                    </p>
                )}
            </div>

            {!sentEmail && (
                <div className={form.element}>
                    <span>Email</span>
                    <input className={form.input} name="email" type="email" required />
                </div>
            )}

            <div className={form.btn_flex}>
                {!sentEmail ? (
                    <button className={form.btn} type="submit">
                        Send
                    </button>
                ) : (
                    <Link legacyBehavior href={"/login"}>
                        <a className={form.btn}>Back</a>
                    </Link>
                )}
            </div>
        </form>
    );
};

export default RecoveryForm;
