import { useEffect, useState } from "react";
import DropdownItem from "./dropdown/DropdownItem";
import { NavbarTabData } from "./Navbar";

type Props = {
    title: string;
    dropdown: NavbarTabData[];
};

const NavbarTab = ({ title, dropdown }: Props) => {
    const [active, updateActive] = useState<boolean>(false);
    const toggleDropdown = () => {
        updateActive(!active);
    };

    const handleClickOutside = (event: any) => {
        if (event.target?.className !== "dropdown-item") {
            updateActive(false);
        }
    };

    useEffect(() => {
        document.addEventListener("click", handleClickOutside, true);
        return () => {
            document.removeEventListener("click", handleClickOutside, true);
        };
    });

    return (
        <div onClick={toggleDropdown} className="navbar-tab">
            <p className="navbar-tab-content unselectable">{title}</p>
            {active && (
                <div className="navbar-dropdown">
                    {dropdown.map((item) => (
                        <DropdownItem
                            key={item.name}
                            content={item.name}
                            icon={item.icon}
                            action={item.action}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default NavbarTab;
