import { read } from "fs";
import Router from "next/router";
import { useContext, useEffect, useState } from "react";
import { Project } from "../../../pages/api/users";
import { UserContext } from "../../../src/context/UserContext";
import { convertFountainToJSON } from "../../../src/converters/fountain_to_scriptio";
import { ActiveButtons } from "../../../src/lib/utils";
import DropdownItem from "./DropdownItem";
import ExportDropdown from "./ExportDropdown";

type Props = {
    activeButtons?: ActiveButtons;
    project: Project;
    toggleDropdown: () => void;
};

const NavbarDropdown = ({ activeButtons, project, toggleDropdown }: Props) => {
    const { editor, updateEditor } = useContext(UserContext);
    const { isScreenplay, isStatistics, isProjectEdition } =
        activeButtons ?? {};
    const [active, updateActive] = useState<boolean>(false);

    const importFile = () => {
        var input = document.createElement("input");
        input.type = "file";
        input.accept = ".fountain";

        input.onchange = async (e: any) => {
            const file: File = e.target!.files[0];
            const reader = new FileReader();

            reader.onload = (e: any) => {
                convertFountainToJSON(e.target.result, editor!);
            };
            reader.readAsText(file, "UTF-8");
        };

        input.click();
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

    const handleClickOutside = (event: any) => {
        if (event.target?.className !== "dropdown-item") {
            toggleDropdown();
        }
    };

    useEffect(() => {
        document.addEventListener("click", handleClickOutside, true);
        return () => {
            document.removeEventListener("click", handleClickOutside, true);
        };
    });

    return (
        <div className="dropdown-items navbar-dropdown">
            {isScreenplay && (
                <DropdownItem
                    hovering={hideExportDropdown}
                    action={importFile}
                    content="Import..."
                />
            )}
            {isScreenplay && (
                <DropdownItem
                    hovering={showExportDropdown}
                    content="Export..."
                />
            )}
            {!isScreenplay && (
                <DropdownItem
                    hovering={hideExportDropdown}
                    action={openScreenplay}
                    content="Screenplay"
                />
            )}
            {!isProjectEdition && (
                <DropdownItem
                    hovering={hideExportDropdown}
                    action={editProject}
                    content="Edit project"
                />
            )}
            {!isStatistics && (
                <DropdownItem
                    hovering={hideExportDropdown}
                    action={openStatistics}
                    content="Statistics"
                />
            )}
            {active && <ExportDropdown project={project} />}
        </div>
    );
};

export default NavbarDropdown;
