import {
    redirectExport,
    redirectProjectInfo,
    redirectScreenplay,
    redirectTitlePage,
    redirectStory,
    redirectStatistics,
    redirectReports,
} from "@src/lib/utils/redirects";
import { Project } from "@src/lib/utils/types";
import { useContext } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { SaveStatus } from "@src/lib/utils/enums";
import { UserContext } from "@src/context/UserContext";
import { importFilePopup } from "@src/lib/editor/popup";
import { convertFountainToJSON } from "@src/converters/import/fountain";
import dynamic from "next/dynamic";

// ------------------------------ //
//              DATA              //
// ------------------------------ //

const NavbarTab = dynamic(() => import("./NavbarTab"));

export type NavbarTabData = {
    name: string;
    action: () => void;
    icon?: string;
};

type NavbarTabs = {
    [tabName: string]: NavbarTabData[];
};

type NavbarMenuProps = {
    project: Project;
};

const NavbarMenu = ({ project }: NavbarMenuProps) => {
    const userCtx = useContext(UserContext);
    const { editor, updateSaveStatus } = useContext(ProjectContext);

    const importFile = () => {
        var input = document.createElement("input");
        input.type = "file";
        input.accept = ".fountain";

        input.onchange = async (e: any) => {
            const file: File = e.target!.files[0];
            const reader = new FileReader();

            reader.onload = (e: any) => {
                const confirmImport = () => {
                    convertFountainToJSON(e.target.result, editor!);
                    updateSaveStatus(SaveStatus.Saving);
                };

                importFilePopup(userCtx, confirmImport);
            };
            reader.readAsText(file, "UTF-8");
        };

        input.click();
    };

    let tabs: NavbarTabs = {};
    if (project) {
        tabs = {
            File: [
                { name: "Import...", action: importFile, icon: "import.png" },
                { name: "Export", action: () => redirectExport(project.id), icon: "export.png" },
            ],
            Edit: [
                { name: "Project info", action: () => redirectProjectInfo(project.id) },
                { name: "Screenplay", action: () => redirectScreenplay(project.id) },
                { name: "Title page", action: () => redirectTitlePage(project.id) },
                { name: "Story", action: () => redirectStory(project.id) },
            ],
            Production: [
                { name: "Statistics", action: () => redirectStatistics(project.id) },
                { name: "Reports", action: () => redirectReports(project.id) },
            ],
        };
    }

    return (
        <>
            {Object.keys(tabs).map((tabName) => (
                <NavbarTab key={tabName} title={tabName} dropdown={tabs[tabName]} />
            ))}
        </>
    );
};

export default NavbarMenu;
