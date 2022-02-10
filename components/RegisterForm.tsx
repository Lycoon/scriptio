const RegisterForm = () => {
  return (
    <div id="register-form">
      <h1 className="segoe-bold">Register</h1>

      <div id="email-form" className="form">
        <input className="input" type="email" placeholder="Email" />
      </div>

      <div id="password-form" className="form">
        <input className="input" type="password" placeholder="Password" />
        <input
          className="input"
          type="password"
          placeholder="Repeat password"
        />
      </div>

      <div id="form-btn-flex">
        <a className="form-btn">Register</a>
      </div>
    </div>
  );
};

export default RegisterForm;
