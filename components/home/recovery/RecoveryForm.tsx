const RecoveryForm = () => {
  async function onSubmit(e: any) {
    e.preventDefault();

    const email = e.target.email.value;
  }

  return (
    <form id="recovery-form" onSubmit={onSubmit}>
      <h1 className="segoe-bold">Recover password</h1>
      <p className="info segoe">
        If the provided email is linked to an existing account, an email will be
        sent with a link to recover your password.
      </p>

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
