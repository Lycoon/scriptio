import Link from "next/link";
import Router from "next/router";
import { useContext, useEffect, useState } from "react";
import { ConnectionStatus, Page } from "@src/lib/utils/enums";
import { useDesktop, usePage, useUser } from "@src/lib/utils/hooks";
import { redirectHome, redirectScreenplay, redirectStatistics } from "@src/lib/utils/redirects";

import { useSWRConfig } from "swr";
import { ProjectContext } from "@src/context/ProjectContext";
import debounce from "debounce";
import { editProject } from "@src/lib/utils/requests";
import { join } from "@src/lib/utils/misc";
import { UserContext } from "@src/context/UserContext";
import { DashboardContext } from "@src/context/DashboardContext";
import { CircleArrowLeft, CircleCheckBig, Download, Eye, EyeClosed, Settings, WifiOff, WifiSync } from "lucide-react";

import navbar from "./Navbar.module.css";
import form from "./../utils/Form.module.css";

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

const StatusIndicator = () => {
    const { connectionStatus } = useContext(ProjectContext);
    const STATUS: Record<ConnectionStatus, string> = {
        "connected": "Synced to cloud",
        "disconnected": "No connection",
        "connecting": "Reconnecting..."
    }
    return <>
        <div className={navbar.tooltip} data-hint={STATUS[connectionStatus]}>
            {connectionStatus === "connected" && <CircleCheckBig style={{ color: 'var(--success)' }} className={navbar.status_icon} />}
            {connectionStatus === "disconnected" && <WifiOff style={{ color: 'var(--error)' }} className={navbar.status_icon} />}
            {connectionStatus === "connecting" && <WifiSync style={{ color: 'var(--warning)' }} className={navbar.status_icon} />}
        </div>
    </>
}

const Navbar = () => {
    const { isZenMode, updateZenMode } = useContext(UserContext);
    const { openDashboard } = useContext(DashboardContext);
    const { project: membership } = useContext(ProjectContext);
    const [hasNavbar, updateHasNavbar] = useState<boolean>(false);
    const [hasScreenplay, updateHasScreenplay] = useState<boolean>(false);

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

    const getNavStyle = (tabName: string) => {
        return `${navbar.navBtn} ${form.label} ${page == tabName ? navbar.active : ''}`;
    };

    useEffect(() => {
        updateHasNavbar(page === Page.Screenplay || page === Page.Statistics);
        updateHasScreenplay(page === Page.Screenplay);
    }, [page]);

    if (!user || !page || !membership)
        return;

    return (
        <nav className={join(navbar.container)}>
            <nav className={navbar.left_btns}>
                <div className={navbar.back_btn} onClick={() => redirectHome()}>
                    <CircleArrowLeft size={18} />
                    <p>Back to projects</p>
                </div>
                <div className={navbar.navBtns}>
                    <p className={`${getNavStyle("screenplay")}`} onClick={() => redirectScreenplay(membership.project.id)}>Screenplay</p>
                    <p className={`${getNavStyle("stats")}`} onClick={() => redirectStatistics(membership.project.id)}>Statistics</p>
                    <p className={`${getNavStyle("board")}`}>Board</p>
                </div>
            </nav>
            {hasScreenplay && (
                <div className={navbar.title_div}>
                    <StatusIndicator />
                    <input
                        type="text"
                        className={navbar.title_box}
                        onChange={(e) => deferredTitleUpdate(membership.project.id, e.target.value)}
                        defaultValue={projectTitle}
                    />
                </div>
            )}
            <div className={navbar.right_btns}>
                {hasScreenplay && (
                    <div className={navbar.export_project_btn} onClick={toggleZenMode}>
                        {isZenMode ? <EyeClosed size={18} /> : <Eye size={18} />}
                    </div>
                )}
                <div className={navbar.export_project_btn} onClick={() => openDashboard("Settings")}>
                    <Settings size={18} />
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
