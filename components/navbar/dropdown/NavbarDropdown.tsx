import Router from "next/router";
import { useEffect, useState } from "react";
import { Project } from "../../../pages/api/users";
import DropdownItem from "./DropdownItem";
import ExportDropdown from "./ExportDropdown";

type Props = {
  project: Project;
  toggleDropdown: () => void;
};

const NavbarDropdown = ({ project, toggleDropdown }: Props) => {
  const [active, updateActive] = useState<boolean>(false);
  const handleClickOutside = (event: Event) => {
    if (event.target?.className !== "dropdown-item") {
      toggleDropdown();
    }
  };

  const importFile = () => {
    console.log("import file");
  };

  const openStatistics = () => {
    Router.push(`/projects/${project.id}/stats`);
  };

  const openScreenplay = () => {
    Router.push(`/projects/${project.id}/editor`);
  };

  const editProject = () => {
    Router.push(`/projects/${project.id}/edit`);
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
        action={openScreenplay}
        content="Screenplay"
      ></DropdownItem>
      <DropdownItem
        hovering={hideExportDropdown}
        action={editProject}
        content="Edit project"
      ></DropdownItem>
      <DropdownItem
        hovering={hideExportDropdown}
        action={openStatistics}
        content="Statistics"
      ></DropdownItem>
      {active && <ExportDropdown project={project} />}
    </div>
  );
};

export default NavbarDropdown;
