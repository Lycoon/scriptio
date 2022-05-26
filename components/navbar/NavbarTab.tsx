import { useState } from "react";
import { Project } from "../../pages/api/users";
import NavbarDropdown from "./dropdown/NavbarDropdown";

type Props = {
  project: Project;
};

const NavbarTab = ({ project }: Props) => {
  const [active, updateActive] = useState<boolean>(false);
  const toggleDropdown = () => {
    updateActive(!active);
  };

  return (
    <div onClick={toggleDropdown} className="navbar-tab">
      <p className="navbar-tab-content unselectable">{project.title}</p>
      <img
        className="dropdown-icon"
        src="/images/arrow.svg"
        alt="Dropdown arrow"
      />
      {active && (
        <NavbarDropdown project={project} toggleDropdown={toggleDropdown} />
      )}
    </div>
  );
};

export default NavbarTab;
