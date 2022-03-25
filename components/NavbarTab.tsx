import { useState } from "react";
import NavbarDropdown from "./NavbarDropdown";

const NavbarTab = (props: any) => {
  const [active, updateActive] = useState<boolean>(false);
  const clicked = () => {
    updateActive(!active);
  };

  return (
    <div onClick={clicked} className="navbar-tab">
      <p className="navbar-tab-content unselectable">{props.content}</p>
      <img
        className="dropdown-icon"
        src="images/dropdown-arrow.svg"
        alt="Dropdown arrow"
      ></img>
      {active && <NavbarDropdown />}
    </div>
  );
};

export default NavbarTab;
