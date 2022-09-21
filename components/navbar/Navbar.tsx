import dynamic from "next/dynamic";
import Link from "next/link";
import Router from "next/router";
import { useContext } from "react";
import { Project } from "../../pages/api/users";
import { UserContext } from "../../src/context/UserContext";
import { saveScreenplay } from "../../src/lib/requests";
import { ActiveButtons } from "../../src/lib/utils";
import NavbarButton from "./NavbarButton";

const NavbarTab = dynamic(() => import("./NavbarTab"));

type Props = {
    activeButtons?: ActiveButtons;
    project?: Project;
};

const onSettings = () => {
    Router.push("/settings");
};

const NotLoggedNavbar = () => (
    <div id="notlogged-navbar-btns">
        <Link className="notlogged-navbar-btn" href={"about"}>
            About
        </Link>
        <Link className="notlogged-navbar-btn" href={"contact"}>
            Contact
        </Link>
        <Link className="notlogged-navbar-btn" href={"donate"}>
            Donate
        </Link>
    </div>
);

const Navbar = ({ activeButtons, project }: Props) => {
    const { user, updateUser, saved, updateSaved } = useContext(UserContext);

    const onLogOut = async () => {
        await fetch("/api/logout");
        updateUser(undefined);
        Router.push("/");
    };

    console.log("saved: ", saved);

    const onSave = () => {
        saveScreenplay(project?.id!, project?.screenplay);
        updateSaved(true);
    };

    return (
        <nav id="navbar">
            <div id="logo-and-tabs">
                <Link href="/">
                    <a id="logo">
                        <p id="logo-text">Scriptio</p>
                    </a>
                </Link>
                {project && (
                    <NavbarTab
                        activeButtons={activeButtons}
                        project={project}
                    />
                )}
            </div>
            {user && user.isLoggedIn ? (
                <div id="navbar-buttons">
                    {activeButtons?.isScreenplay && (
                        <div
                            className={"save-btn" + (saved ? " disabled" : "")}
                            onClick={onSave}
                        >
                            <img
                                className="settings-icon"
                                src="/images/save.png"
                            />
                        </div>
                    )}
                    <div className="settings-btn" onClick={onSettings}>
                        <img className="settings-icon" src="/images/gear.png" />
                    </div>
                    <NavbarButton content="Log out" action={onLogOut} />
                </div>
            ) : (
                <NotLoggedNavbar />
            )}
        </nav>
    );
};

export default Navbar;
