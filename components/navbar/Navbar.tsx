import dynamic from "next/dynamic";
import Link from "next/link";
import Router, { useRouter } from "next/router";
import { useContext } from "react";
import { Project } from "../../pages/api/users";
import { UserContext } from "../../src/context/UserContext";
import NavbarButton from "./NavbarButton";

const NavbarTab = dynamic(() => import("./NavbarTab"));

type Props = {
    project?: Project;
};

const onSettings = () => {
    Router.push("/settings");
};

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

const NotLoggedNavbar = () => (
    <div id="notlogged-navbar-btns">
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
    const { user, updateUser, isSaving, project } = useContext(UserContext);
    const { asPath } = useRouter();
    const page = getCurrentPage(asPath);

    const onLogOut = async () => {
        await fetch("/api/logout");
        updateUser(undefined);
        Router.push("/");
    };

    return (
        <nav id="navbar" className="sidebar-shadow">
            <div id="logo-and-tabs">
                <Link href="/">
                    <a id="logo">
                        <p id="logo-text">Scriptio</p>
                    </a>
                </Link>
                {project && (
                    <>
                        <NavbarTab title="File" project={project} />
                        <NavbarTab title="Edit" project={project} />
                        <NavbarTab title="Story" project={project} />
                        <NavbarTab title="Production" project={project} />
                    </>
                )}
            </div>
            {user && user.isLoggedIn ? (
                <div id="navbar-buttons">
                    {page === PAGE.SCREENPLAY && isSaving && (
                        <div className="saving-spin">
                            <img className="settings-icon" src="/images/saving.svg" />
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
