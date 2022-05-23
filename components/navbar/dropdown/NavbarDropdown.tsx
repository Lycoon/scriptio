import { useEffect, useState } from "react";
import DropdownItem from "./DropdownItem";
import ExportDropdown from "./ExportDropdown";

const NavbarDropdown = (props: any) => {
  const [active, updateActive] = useState<boolean>(false);
  const handleClickOutside = (event: Event) => {
    if (event.target?.className !== "dropdown-item") {
      props.toggleDropdown();
    }
  };

  const importFile = () => {
    console.log("import file");
  };

  const openStatistics = () => {
    console.log("open statistics");
  };

  const editProject = () => {
    console.log("edit project");
  };

  const hideExportDropdown = () => {
    updateActive(false);
  };

  const showExportDropdown = () => {
    updateActive(true);
  };

  useEffect(() => {
    document.addEventListener("click", handleClickOutside, true);
    return () => {
      document.removeEventListener("click", handleClickOutside, true);
    };
  });

  return (
    <div className="dropdown-items navbar-dropdown">
      <DropdownItem
        hovering={hideExportDropdown}
        action={importFile}
        content="Import..."
      ></DropdownItem>
      <DropdownItem
        hovering={showExportDropdown}
        content="Export..."
      ></DropdownItem>
      <DropdownItem
        hovering={hideExportDropdown}
        action={openStatistics}
        content="Statistics"
      ></DropdownItem>
      <DropdownItem
        hovering={hideExportDropdown}
        action={editProject}
        content="Edit project"
      ></DropdownItem>
      {active && <ExportDropdown />}
    </div>
  );
};

export default NavbarDropdown;
