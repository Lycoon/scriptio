import { useState } from "react";
import NavbarDropdown from "./dropdown/NavbarDropdown";

const NavbarTab = (props: any) => {
  const [active, updateActive] = useState<boolean>(false);
  const toggleDropdown = () => {
    updateActive(!active);
  };

  return (
    <div onClick={toggleDropdown} className="navbar-tab">
      <p className="navbar-tab-content unselectable">{props.content}</p>
      <img
        className="dropdown-icon"
        src="images/dropdown-arrow.svg"
        alt="Dropdown arrow"
      ></img>
      {active && <NavbarDropdown toggleDropdown={toggleDropdown} />}
    </div>
  );
};

export default NavbarTab;
