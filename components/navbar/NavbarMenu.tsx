"use client";

import { redirectExport, redirectProjectInfo, redirectScreenplay, redirectStatistics } from "@src/lib/utils/redirects";
import { useContext } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { ConnectionStatus } from "@src/lib/utils/enums";
import { UserContext } from "@src/context/UserContext";
import { importFilePopup } from "@src/lib/screenplay/popup";
import { convertFountainToHTML } from "@src/lib/adapters/fountain/fountain-import";
import dynamic from "next/dynamic";
import { generateJSON } from "@tiptap/react";
import { BASE_EXTENSIONS, replaceScreenplay } from "@src/lib/screenplay/editor";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { Screenplay } from "@src/lib/utils/types";

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
    project: ProjectMembershipPayload["project"];
};

const NavbarMenu = ({ project }: NavbarMenuProps) => {
    const userCtx = useContext(UserContext);
    const projectCtx = useContext(ProjectContext);
    const { editor, updateConnectionStatus: updateSaveStatus } = projectCtx;

    const importFile = () => {
        if (!editor) return;

        var input = document.createElement("input");
        input.type = "file";
        input.accept = ".fountain";

        input.onchange = async (e: any) => {
            const file: File = e.target!.files[0];
            const reader = new FileReader();

            reader.onload = (e: any) => {
                const confirmImport = () => {
                    const html = convertFountainToHTML(e.target.result);
                    const json = generateJSON(html, BASE_EXTENSIONS) as Screenplay;

                    replaceScreenplay(editor, json);
                    // Scenes are automatically recomputed when screenplay changes
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
                /*{ name: "Title page", action: () => redirectTitlePage(project.id) },*/
                /*{ name: "Story", action: () => redirectStory(project.id) },*/
            ],
            Production: [
                { name: "Statistics", action: () => redirectStatistics(project.id) },
                /*{ name: "Reports", action: () => redirectReports(project.id) },*/
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
