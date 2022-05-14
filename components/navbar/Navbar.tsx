import Router from "next/router";
import { useEffect, useState } from "react";
import NavbarButton from "./NavbarButton";
import NavbarTab from "./NavbarTab";

const HomePageNavbar = (props: any) => {
  const user = props.user;
  const [isLoggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(user?.isLoggedIn);
  }, [user, isLoggedIn]);

  const onLogOut = async () => {
    await fetch("/api/logout");
    Router.push("");
  };

  const onLogIn = () => {
    Router.push("login");
  };

  const onSignUp = () => {
    Router.push("register");
  };

  const onSettings = () => {
    Router.push("settings");
  };

  return (
    <nav id="navbar">
      <div id="logo-and-tabs">
        <a id="logo" href="http://localhost:3000">
          <img src="https://i.imgur.com/uIOrnUi.png" width="100" height="28" />
        </a>
        {isLoggedIn && <NavbarTab content="Reverse"></NavbarTab>}
      </div>
      {!isLoggedIn ? (
        <div id="navbar-buttons">
          <NavbarButton content="Log in" action={onLogIn} />
          <NavbarButton content="Create account" action={onSignUp} />
        </div>
      ) : (
        <div id="navbar-buttons">
          <NavbarButton content="Settings" action={onSettings} />
          <NavbarButton content="Log out" action={onLogOut} />
        </div>
      )}
    </nav>
  );
};

export default HomePageNavbar;
