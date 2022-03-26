import NavbarButton from "./NavbarButton";
import NavbarTab from "./NavbarTab";

const HomePageNavbar = (props: any) => {
  return (
    <nav id="navbar">
      <div id="logo-and-tabs">
        <a id="logo" href="http://localhost:3000">
          <img src="https://i.imgur.com/uIOrnUi.png" width="100" height="28" />
        </a>
        <NavbarTab content="La Fugue"></NavbarTab>
      </div>
      <div id="navbar-buttons">
        <NavbarButton content="Log in" redirect="login"></NavbarButton>
        <NavbarButton
          content="Create account"
          redirect="register"
        ></NavbarButton>
      </div>
    </nav>
  );
};

export default HomePageNavbar;
