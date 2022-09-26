import { sendRecover } from "../../../src/lib/requests";

const RecoveryForm = () => {
    const onSubmit = async (e: any) => {
        e.preventDefault();

        const email = e.target.email.value;
        const res = await sendRecover(email);
    };

    return (
        <form id="recovery-form" onSubmit={onSubmit}>
            <div className="form-header">
                <h1>Recover password</h1>
                <hr className="hr-form" />
                <p className="recovery-info segoe">
                    If the provided email is linked to an existing account, an
                    email will be sent with a link to recover your password.
                </p>
            </div>

            <div id="email-form" className="form-element">
                <span className="form-label">Email</span>
                <input className="form-input" name="email" type="email" />
            </div>

            <div id="form-btn-flex">
                <button className="form-btn" type="submit">
                    Send
                </button>
            </div>
        </form>
    );
};

export default RecoveryForm;
