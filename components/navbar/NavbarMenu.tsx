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
import { convertFountainToHTML } from "@src/converters/import/fountain";
import dynamic from "next/dynamic";
import { computeFullCharactersData } from "@src/lib/editor/characters";
import { computeFullScenesData } from "@src/lib/editor/screenplay";
import { saveScreenplay } from "@src/lib/utils/requests";
import { generateJSON } from "@tiptap/react";
import { SCRIPTIO_EXTENSIONS, replaceScreenplay } from "@src/lib/editor/editor";

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
    const projectCtx = useContext(ProjectContext);
    const { screenplayEditor, updateSaveStatus } = projectCtx;

    const importFile = () => {
        if (!screenplayEditor) return;

        var input = document.createElement("input");
        input.type = "file";
        input.accept = ".fountain";

        input.onchange = async (e: any) => {
            const file: File = e.target!.files[0];
            const reader = new FileReader();

            reader.onload = (e: any) => {
                const confirmImport = () => {
                    const html = convertFountainToHTML(e.target.result);
                    const json = generateJSON(html, SCRIPTIO_EXTENSIONS);

                    updateSaveStatus(SaveStatus.Saving);
                    replaceScreenplay(screenplayEditor, json);
                    computeFullCharactersData(json, projectCtx);
                    computeFullScenesData(json, projectCtx);
                    saveScreenplay(projectCtx, json);
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
                { name: "Import", action: importFile, icon: "import.png" },
                { name: "Export", action: () => redirectExport(project.id), icon: "export.png" },
            ],
            Edit: [
                { name: "Project info", action: () => redirectProjectInfo(project.id) },
                { name: "Screenplay", action: () => redirectScreenplay(project.id) },
                { name: "Title page", action: () => redirectTitlePage(project.id) },
                /*{ name: "Story", action: () => redirectStory(project.id) },*/
            ],
            /*Production: [
                { name: "Statistics", action: () => redirectStatistics(project.id) },
                { name: "Reports", action: () => redirectReports(project.id) },
            ],*/
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
