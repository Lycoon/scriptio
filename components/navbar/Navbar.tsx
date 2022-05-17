import Router from "next/router";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "../../src/context/UserContext";
import NavbarButton from "./NavbarButton";
import NavbarTab from "./NavbarTab";

const HomePageNavbar = () => {
  const ctx = useContext(UserContext);
  const user = ctx.user;

  const onLogOut = async () => {
    await fetch("/api/logout");
    ctx.updateUser(undefined);
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
        {user?.isLoggedIn && <NavbarTab content="Reverse"></NavbarTab>}
      </div>
      {!user?.isLoggedIn ? (
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
