import Router from "next/router";

const RegisterForm = () => {
  async function onSubmit(e: any) {
    e.preventDefault();

    const body = {
      email: e.target.email.value,
      password: e.target.password1.value,
    };

    if (body.password !== e.target.password2.value) {
      return;
    }

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 201) {
      Router.push("/login");
    } else {
      return;
    }
  }

  return (
    <form id="register-form" onSubmit={onSubmit}>
      <h1 className="segoe-bold">Register</h1>

      <label id="email-form" className="form-element">
        <span className="form-label">Email</span>
        <input className="form-input" name="email" type="email" required />
      </label>

      <label id="password-form" className="form-element">
        <span className="form-label">Password</span>
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
          Register
        </button>
      </div>
    </form>
  );
};

export default RegisterForm;
