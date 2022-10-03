import { useState } from "react";
import { Project } from "../../pages/api/users";
import { Page } from "../../src/lib/utils";
import NavbarDropdown from "./dropdown/NavbarDropdown";

type Props = {
    page: Page;
    project: Project;
};

const NavbarTab = ({ page, project }: Props) => {
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
                    page={page}
                    project={project}
                    toggleDropdown={toggleDropdown}
                />
            )}
        </div>
    );
};

export default NavbarTab;
