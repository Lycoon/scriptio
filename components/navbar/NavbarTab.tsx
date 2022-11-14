import { useState } from "react";
import { Project } from "../../pages/api/users";
import { Page } from "../../src/lib/utils";
import NavbarDropdown from "./dropdown/NavbarDropdown";

type Props = {
    project: Project;
    title: string;
};

const NavbarTab = ({ project, title }: Props) => {
    const [active, updateActive] = useState<boolean>(false);
    const toggleDropdown = () => {
        updateActive(!active);
    };

    return (
        <div onClick={toggleDropdown} className="navbar-tab">
            <p className="navbar-tab-content unselectable">{title}</p>
            {active && <NavbarDropdown project={project} toggleDropdown={toggleDropdown} />}
        </div>
    );
};

export default NavbarTab;
