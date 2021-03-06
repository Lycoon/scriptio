import { useState } from "react";
import { Project } from "../../pages/api/users";
import { ActiveButtons } from "../../src/lib/utils";
import NavbarDropdown from "./dropdown/NavbarDropdown";

type Props = {
    activeButtons?: ActiveButtons;
    project: Project;
};

const NavbarTab = ({ activeButtons, project }: Props) => {
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
                <NavbarDropdown
                    activeButtons={activeButtons}
                    project={project}
                    toggleDropdown={toggleDropdown}
                />
            )}
        </div>
    );
};

export default NavbarTab;
