import Link from "next/link";
import Router from "next/router";
import { useContext, useEffect, useState } from "react";
import { Page, SaveStatus } from "@src/lib/utils/enums";
import { useDesktop, usePage, useUser } from "@src/lib/utils/hooks";
import NavbarButton from "./NavbarButton";
import { redirectLogin, redirectSettings } from "@src/lib/utils/redirects";

import SettingsSVG from "@public/images/gear.svg";
import LogoutSVG from "@public/images/logout.svg";
import SavingSVG from "@public/images/saving.svg";
import CheckmarkSVG from "@public/images/checkmark.svg";
import OfflineSVG from "@public/images/offline.svg";
import EyeSVG from "@public/images/eye.svg";

import navbar from "./Navbar.module.css";
import sidebar from "../editor/sidebar/EditorSidebar.module.css";
import { useSWRConfig } from "swr";
import { ProjectContext } from "@src/context/ProjectContext";
import debounce from "debounce";
import { editProject } from "@src/lib/utils/requests";
import { join } from "@src/lib/utils/misc";
import NavbarMenu from "./NavbarMenu";
import { UserContext } from "@src/context/UserContext";

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
            return <SavingSVG className={navbar.status} />;
        case SaveStatus.Saved:
            return <CheckmarkSVG className={join(navbar.status, navbar.success)} />;
        case SaveStatus.Error:
            return <OfflineSVG className={join(navbar.status, navbar.failed)} />;
    }
};

const Navbar = () => {
    const userCtx = useContext(UserContext);
    const projectCtx = useContext(ProjectContext);
    const { project } = projectCtx;
    const { updateZenMode } = userCtx;

    const page = usePage();
    const isDesktop = useDesktop();
    const { mutate } = useSWRConfig();
    const { data: user } = useUser();

    const [projectTitle, setProjectTitle] = useState<string>("");
    useEffect(() => {
        if (project) setProjectTitle(project.title);
    }, [project]);

    const onLogOut = async () => {
        // 1. This destroys the session on the server
        await fetch("/api/logout");
        // 2. This revalidates the SWR cache with an empty user
        mutate("/api/users/cookie", undefined);
        // 3. This redirects the user to the login page
        Router.push("/");
    };

    const deferredTitleUpdate = debounce(async (projectId: string, projectTitle: string) => {
        await editProject({ projectId, title: projectTitle });
        mutate(`/api/projects/${projectId}`, { ...project, title: projectTitle });
    }, 1000);

    const toggleZenMode = () => updateZenMode(!userCtx.isZenMode);

    let NavbarButtons;
    if (user) {
        // Logged in on web OR desktop app
        NavbarButtons = () => (
            <div className={navbar.btns}>
                {page === Page.Screenplay && (
                    <EyeSVG className={join(navbar.btn, navbar.zen_btn)} onClick={toggleZenMode} alt="Eye icon" />
                )}
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
        <nav className={join(navbar.container, sidebar.shadow)}>
            <div className={navbar.logo_and_tabs}>
                <Link legacyBehavior href="/">
                    <a className={navbar.logo}>
                        <p className={navbar.logo_text}>Scriptio</p>
                    </a>
                </Link>
                <NavbarMenu project={project!} />
            </div>
            <div className={navbar.title}>
                {page === Page.Screenplay && (
                    <>
                        <SaveStatusNavbar />
                        <input
                            type="text"
                            className={navbar.title_box}
                            onChange={(e) => deferredTitleUpdate(project!.id, e.target.value)}
                            defaultValue={projectTitle}
                        />
                    </>
                )}
            </div>
            <NavbarButtons />
        </nav>
    );
};

export default Navbar;
