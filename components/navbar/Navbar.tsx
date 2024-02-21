import dynamic from "next/dynamic";
import Link from "next/link";
import Router, { useRouter } from "next/router";
import { useContext } from "react";
import { UserContext } from "@src/context/UserContext";
import { convertFountainToJSON } from "@src/converters/import/fountain";
import PopupImportFile from "../popup/PopupImportFile";
import { Project } from "@prisma/client";
import { SaveStatus } from "@src/lib/utils/enums";
import { useDesktop, useUser } from "@src/lib/utils/hooks";
import NavbarButton from "./NavbarButton";
import {
    redirectExport,
    redirectLogin,
    redirectProjectInfo,
    redirectReports,
    redirectScreenplay,
    redirectSettings,
    redirectStatistics,
    redirectStory,
    redirectTitlePage,
} from "@src/lib/utils/redirects";

import SettingsSVG from "@public/images/gear.svg";
import LogoutSVG from "@public/images/logout.svg";
import SavingSVG from "@public/images/saving.svg";

import settings from "../settings/SettingsPageContainer.module.css";
import navbar from "./Navbar.module.css";
import sidebar from "../editor/sidebar/EditorSidebar.module.css";
import { useSWRConfig } from "swr";
import { ProjectContext } from "@src/context/ProjectContext";
import { closePopup, importFilePopup } from "@src/lib/editor/popup";

const NavbarTab = dynamic(() => import("./NavbarTab"));

// ------------------------------ //
//              DATA              //
// ------------------------------ //
enum PAGE {
    // /{page}
    INDEX = "index",
    SETTINGS = "settings",
    ABOUT = "about",
    LOGIN = "login",
    SIGNUP = "signup",
    RECOVER = "recover",

    // /projects/{id}/{page}
    SCREENPLAY = "screenplay",
    STATISTICS = "statistics",
    EDIT = "edit",
    EXPORT = "export",
}

export type NavbarTabData = {
    name: string;
    action: () => void;
    icon?: string;
};

type Props = {
    project?: Project;
};

type NavbarTabs = {
    [tabName: string]: NavbarTabData[];
};

// ------------------------------ //
//            FUNCTIONS           //
// ------------------------------ //
const getCurrentPage = (path: string) => {
    if (path === "/") return PAGE.INDEX;

    const route = path.split("/");
    switch (route[1]) {
        case "login":
            return PAGE.LOGIN;
        case "signup":
            return PAGE.SIGNUP;
        case "about":
            return PAGE.ABOUT;
        case "recover":
            return PAGE.RECOVER;
    }

    switch (route[3]) {
        case "screenplay":
            return PAGE.SCREENPLAY;
        case "statistics":
            return PAGE.STATISTICS;
        case "edit":
            return PAGE.EDIT;
        case "export":
            return PAGE.EXPORT;
    }
};

// ------------------------------ //
//           COMPONENTS           //
// ------------------------------ //
const NotLoggedNavbar = () => (
    <div className={navbar.notlogged_btns}>
        <Link className="notlogged-navbar-btn" href={"/about"}>
            About
        </Link>
        <Link className="notlogged-navbar-btn" href={"/contact"}>
            Contact
        </Link>
        <Link className="notlogged-navbar-btn" target={"_blank"} href={"https://paypal.me/lycoon"}>
            Donate
        </Link>
    </div>
);

const SaveStatusNavbar = () => {
    const { saveStatus } = useContext(ProjectContext);

    switch (saveStatus) {
        case SaveStatus.Saving:
            return (
                <div className={navbar.saving_spin}>
                    <SavingSVG className={settings.icon} />
                </div>
            );
        case SaveStatus.Saved:
            return <p className={navbar.last_saved}>In sync</p>;
        case SaveStatus.NotSaved:
            return <p className={navbar.last_saved}>Not saved</p>;
        case SaveStatus.Error:
            return <p className={navbar.last_saved}>Error</p>;
    }
};

const Navbar = () => {
    const userCtx = useContext(UserContext);
    const { editor, updatePopup } = userCtx;

    const { project, updateSaveStatus } = useContext(ProjectContext);

    const { asPath } = useRouter();
    const page = getCurrentPage(asPath);

    const { mutate } = useSWRConfig();
    const isDesktop = useDesktop();
    const { data: user, isLoading } = useUser();

    if (isLoading) return null;

    const onLogOut = async () => {
        // 1. This destroys the session on the server
        await fetch("/api/logout");
        // 2. This revalidates the SWR cache with an empty user
        mutate("/api/users/cookie", undefined);

        Router.push("/");
    };

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
                    updateSaveStatus(SaveStatus.NotSaved);
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

    let NavbarButtons;
    if (user) {
        // Logged in on web OR desktop app
        NavbarButtons = () => (
            <div className={navbar.btns}>
                {page === PAGE.SCREENPLAY && <SaveStatusNavbar />}
                <SettingsSVG className={navbar.btn} onClick={redirectSettings} alt="Settings icon" />
                <LogoutSVG className={navbar.btn} onClick={onLogOut} alt="Logout icon" />
            </div>
        );
    } else if (isDesktop) {
        // Not logged in + on desktop app
        NavbarButtons = () => (
            <div className={navbar.btns}>
                <NavbarButton content="Log in" action={redirectLogin} />
            </div>
        );
    } else {
        // Not loggedin + on web
        NavbarButtons = () => <NotLoggedNavbar />;
    }

    return (
        <nav className={navbar.container + " " + sidebar.shadow}>
            <div className={navbar.logo_and_tabs}>
                <Link legacyBehavior href="/">
                    <a className={navbar.logo}>
                        <p className={navbar.logo_text}>Scriptio</p>
                    </a>
                </Link>
                {project && (
                    <>
                        {Object.keys(tabs).map((tabName) => (
                            <NavbarTab key={tabName} title={tabName} dropdown={tabs[tabName]} />
                        ))}
                    </>
                )}
            </div>
            <NavbarButtons />
        </nav>
    );
};

export default Navbar;
