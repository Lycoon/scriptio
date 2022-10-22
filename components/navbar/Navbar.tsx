import dynamic from "next/dynamic";
import Link from "next/link";
import Router, { useRouter } from "next/router";
import { useContext } from "react";
import { Project } from "../../pages/api/users";
import { UserContext } from "../../src/context/UserContext";
import { saveScreenplay } from "../../src/lib/requests";
import NavbarButton from "./NavbarButton";

const pages = {
    "": "",
};

const NavbarTab = dynamic(() => import("./NavbarTab"));

type Props = {
    project?: Project;
};

const onSettings = () => {
    Router.push("/settings");
};

const getCurrentPage = () => {
    const { asPath } = useRouter();
    const page = asPath.split("/")[1];

    return page;
};

const NotLoggedNavbar = () => (
    <div id="notlogged-navbar-btns">
        <Link className="notlogged-navbar-btn" href={"/about"}>
            About
        </Link>
        <Link className="notlogged-navbar-btn" href={"/contact"}>
            Contact
        </Link>
        <Link
            className="notlogged-navbar-btn"
            target={"_blank"}
            href={"https://paypal.me/lycoon"}
        >
            Donate
        </Link>
    </div>
);

const Navbar = () => {
    const page = getCurrentPage();
    const { user, updateUser, saved, updateSaved, project } =
        useContext(UserContext);

    const onLogOut = async () => {
        await fetch("/api/logout");
        updateUser(undefined);
        Router.push("/");
    };

    const onSave = () => {
        saveScreenplay(project?.userId!, project?.id!, project?.screenplay);
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
                {project && <NavbarTab project={project} />}
            </div>
            {user && user.isLoggedIn ? (
                <div id="navbar-buttons">
                    {/*page === Page.SCREENPLAY && (
                        <div
                            className={"save-btn" + (saved ? " disabled" : "")}
                            onClick={onSave}
                        >
                            <img
                                className="settings-icon"
                                src="/images/save.png"
                            />
                        </div>
                    )*/}
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
