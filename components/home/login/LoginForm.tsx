import Router from "next/router";
import { useContext, useState } from "react";
import { UserContext } from "../../../src/context/UserContext";
import FormError from "../FormError";

const LoginForm = () => {
  const { user, updateUser } = useContext(UserContext);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined
  );

  async function onSubmit(e: any) {
    e.preventDefault();
    setErrorMessage(undefined);

    const body = {
      email: e.target.email.value,
      password: e.target.password.value,
    };

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const s = (await res.json()).body;
    console.log("user: ", s);

    if (res.status === 200) {
      updateUser(s);
      Router.push("/");
    } else {
      setErrorMessage((await res.json()).message);
    }
  }

  return (
    <form id="login-form" onSubmit={onSubmit}>
      <h1 className="segoe-bold">Log in</h1>
      {errorMessage && <FormError message={errorMessage} />}

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
          onChange={() => setErrorMessage(undefined)}
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
