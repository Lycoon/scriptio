import { useEffect, useRef } from "react";
import DropdownItem from "./DropdownItem";

const NavbarDropdown = (props: any) => {
  const handleClickOutside = (event: Event) => {
      if (event.target!.className !== "dropdown-item") {
          console.log("CLICKED OUTSIDE")
      }
  };

  useEffect(() => {
      document.addEventListener('click', handleClickOutside, true);
      return () => {
          document.removeEventListener('click', handleClickOutside, true);
      };
  });

  return (
    <div className="dropdown-items">
      <DropdownItem content="Import..."></DropdownItem>
      <DropdownItem content="Export..."></DropdownItem>
      <DropdownItem content="Statistics"></DropdownItem>
      <DropdownItem content="Edit project"></DropdownItem>
    </div>
  );
};

export default NavbarDropdown;
