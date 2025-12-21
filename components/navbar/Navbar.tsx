import Link from "next/link";
import Router from "next/router";
import { useContext, useEffect, useState } from "react";
import { Page, SaveStatus } from "@src/lib/utils/enums";
import { useDesktop, usePage, useUser } from "@src/lib/utils/hooks";
import NavbarButton from "./NavbarButton";
import { redirectHome, redirectLogin } from "@src/lib/utils/redirects";

import SettingsSVG from "@public/images/gear.svg";
import LogoutSVG from "@public/images/logout.svg";
import CheckmarkSVG from "@public/images/checkmark.svg";
import EyeSVG from "@public/images/eye.svg";
import BackSVG from "@public/images/back2.svg";
import ExportSVG from "@public/images/export.svg";
import OnlineSVG from "@public/images/online.svg";
import OfflineSVG from "@public/images/offline.svg";

import { useSWRConfig } from "swr";
import { ProjectContext } from "@src/context/ProjectContext";
import debounce from "debounce";
import { editProject } from "@src/lib/utils/requests";
import { join } from "@src/lib/utils/misc";
import { UserContext } from "@src/context/UserContext";
import { DashboardContext } from "@src/context/DashboardContext";

import navbar from "./Navbar.module.css";

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

const Navbar = () => {
    const { isZenMode, updateZenMode } = useContext(UserContext);
    const { openDashboard } = useContext(DashboardContext);
    const { project: membership } = useContext(ProjectContext);

    const page = usePage();
    const isDesktop = useDesktop();
    const { mutate } = useSWRConfig();
    const { user } = useUser();

    const [projectTitle, setProjectTitle] = useState<string>("");
    useEffect(() => {
        if (membership) setProjectTitle(membership.project.title);
    }, [membership]);

    const onLogOut = async () => {
        // 1. This destroys the session on the server
        await fetch("/api/logout");
        // 2. This revalidates the SWR cache with an empty user
        mutate("/api/users/cookie", undefined);
        // 3. This redirects the user to the login page
        Router.push("/");
    };

    const deferredTitleUpdate = debounce(async (projectId: string, projectTitle: string) => {
        await editProject(projectId, { title: projectTitle });
        mutate(`/api/projects/${projectId}`, { ...membership, title: projectTitle });
    }, 1000);

    const toggleZenMode = () => updateZenMode(!isZenMode);

    let NavbarButtons;
    if (user) {
        // Logged in on web OR desktop app
        NavbarButtons = () => <div></div>;
    } else if (isDesktop) {
        // Not logged in + on desktop app
        NavbarButtons = () => <div></div>;
    } else {
        // Not loggedin + on web
        NavbarButtons = () => <NotLoggedNavbar />;
    }

    return (
        <nav className={join(navbar.container)}>
            {page === Page.Screenplay && (
                <div className={navbar.left_btns}>
                    <div className={navbar.back_btn} onClick={() => redirectHome()}>
                        <BackSVG />
                        <p>Back to projects</p>
                    </div>
                    <div className={navbar.export_project_btn} onClick={() => openDashboard("Export")}>
                        <ExportSVG />
                        <p>Export...</p>
                    </div>
                </div>
            )}
            {page === Page.Screenplay && membership && (
                <div className={navbar.title_div}>
                    {<OnlineSVG className={navbar.status_icon} />}
                    <input
                        type="text"
                        className={navbar.title_box}
                        onChange={(e) => deferredTitleUpdate(membership.project.id, e.target.value)}
                        defaultValue={projectTitle}
                    />
                </div>
            )}
            {page === Page.Screenplay && (
                <div className={navbar.right_btns}>
                    <div className={navbar.export_project_btn} onClick={toggleZenMode}>
                        <EyeSVG />
                        <p>Zen mode</p>
                    </div>
                    <div className={navbar.export_project_btn} onClick={() => openDashboard("Settings")}>
                        <SettingsSVG />
                        <p>Settings</p>
                    </div>
                </div>
            )}
        </nav>
    );
};

export default Navbar;
