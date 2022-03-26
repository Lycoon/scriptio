const RecoveryForm = () => {
  return (
    <div id="recovery-form">
      <h1 className="segoe-bold">Recover password</h1>
      <p className="info segoe">
        If the provided email is linked to an existing account, an email will be
        sent with a link to recover your password.
      </p>

      <div id="email-form" className="form">
        <input className="input" type="email" placeholder="Email" />
      </div>

      <div id="form-btn-flex">
        <a className="form-btn">Send</a>
      </div>
    </div>
  );
};

export default RecoveryForm;
