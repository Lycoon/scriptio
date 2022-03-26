const LoginForm = () => {
  return (
    <div id="login-form">
      <h1 className="segoe-bold">Log in</h1>

      <div id="email-form" className="form">
        <input className="input" type="email" placeholder="Email" />
      </div>

      <div id="password-form" className="form">
        <input className="input" type="password" placeholder="Password" />
        <a href="/recovery">Forgot password?</a>
      </div>

      <div id="form-btn-flex">
        <a className="form-btn">Log in</a>
      </div>
    </div>
  );
};

export default LoginForm;
