import { useEffect, useRef } from "react";
import DropdownItem from "./DropdownItem";

const NavbarDropdown = (props: any) => {
  const ref = useRef(null);
  const onClickOutside = () => {
    console.log("close dropdown");
  };

  useEffect(() => {
    const handleClickOutside = (event: any) => {
      if (ref.current && !ref.current.contains(event.target)) {
        onClickOutside && onClickOutside();
      }
    };

    document.addEventListener("click", handleClickOutside, true);

    return () => {
      document.removeEventListener("click", handleClickOutside, true);
    };
  }, [onClickOutside]);

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
