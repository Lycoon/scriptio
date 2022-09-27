import Router from "next/router";
import { useState } from "react";
import { sendRecover } from "../../../src/lib/requests";

const RecoveryForm = () => {
    const [sentEmail, setSetSentEmail] = useState(false);
    const backToLogin = () => {
        Router.push(`/login`);
    };

    const onSubmit = async (e: any) => {
        e.preventDefault();

        const email = e.target.email.value;
        sendRecover(email);
        setSetSentEmail(true);
    };

    return (
        <form id="recovery-form" onSubmit={onSubmit}>
            <div className="form-header">
                <h1>Recover password</h1>
                <hr className="hr-form" />
                {sentEmail && (
                    <p className="recovery-info segoe">
                        If the provided email is linked to an existing account,
                        an email will be sent with a link to recover your
                        password.
                    </p>
                )}
            </div>

            {!sentEmail && (
                <div id="email-form" className="form-element">
                    <span className="form-label">Email</span>
                    <input className="form-input" name="email" type="email" />
                </div>
            )}

            <div id="form-btn-flex">
                {!sentEmail ? (
                    <button className="form-btn" type="submit">
                        Send
                    </button>
                ) : (
                    <button className="form-btn" onClick={backToLogin}>
                        Back to login
                    </button>
                )}
            </div>
        </form>
    );
};

export default RecoveryForm;
