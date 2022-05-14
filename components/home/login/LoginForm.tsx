import Router from "next/router";

const LoginForm = () => {
  async function onSubmit(e: any) {
    e.preventDefault();

    const body = {
      email: e.target.email.value,
      password: e.target.password.value,
    };

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 200) {
      Router.push("/");
    }

    return;
  }

  return (
    <form id="login-form" onSubmit={onSubmit}>
      <h1 className="segoe-bold">Log in</h1>

      <label id="email-form" className="form-element">
        <span className="form-label">Email</span>
        <input className="form-input" name="email" type="email" required />
      </label>

      <label id="password-form" className="form-element">
        <span className="form-label">Password</span>
        <input
          className="form-input"
          name="password"
          type="password"
          required
        />
        <a id="forgot-password" href="/recovery">
          Forgot password?
        </a>
      </label>

      <div id="form-btn-flex">
        <button className="form-btn" type="submit">
          Log in
        </button>
      </div>
    </form>
  );
};

export default LoginForm;
