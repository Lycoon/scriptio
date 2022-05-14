import { useEffect, useState } from "react";
import NavbarButton from "./NavbarButton";
import NavbarTab from "./NavbarTab";

const HomePageNavbar = (props: any) => {
  const user = props.user;
  const [isLoggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(user?.isLoggedIn);
  }, [user, isLoggedIn]);

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
          <NavbarButton content="Log in" redirect="login"></NavbarButton>
          <NavbarButton
            content="Create account"
            redirect="register"
          ></NavbarButton>
        </div>
      ) : (
        <div id="navbar-buttons">
          <NavbarButton content="Settings" redirect=""></NavbarButton>
          <NavbarButton
            content="Log out"
            redirect=""
            action={() => {
              fetch("/api/logout");
            }}
          ></NavbarButton>
        </div>
      )}
    </nav>
  );
};

export default HomePageNavbar;
