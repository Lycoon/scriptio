import { useEffect, useRef, useState } from "react";
import DropdownItem from "./dropdown/DropdownItem";
import { NavbarTabData } from "./Navbar";

import tab from "./NavbarTab.module.css";
import { join } from "@src/lib/utils/misc";

type Props = {
    title: string;
    dropdown: NavbarTabData[];
};

const NavbarTab = ({ title, dropdown }: Props) => {
    const ref = useRef<HTMLButtonElement>(null);
    const [active, updateActive] = useState<boolean>(false);

    const toggleDropdown = () => {
        updateActive(!active);
    };

    const handleClickOutside = (event: any) => {
        if (event.target?.className !== ref.current?.className) {
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
        <div onClick={toggleDropdown} className={tab.container}>
            <p className={join(tab.content, "unselectable")}>{title}</p>
            {active && (
                <div className={tab.dropdown}>
                    {dropdown.map((item) => (
                        <DropdownItem
                            key={item.name}
                            content={item.name}
                            icon={item.icon}
                            action={item.action}
                            ref={ref}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default NavbarTab;
