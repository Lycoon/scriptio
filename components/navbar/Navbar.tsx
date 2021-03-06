import dynamic from "next/dynamic";
import Link from "next/link";
import Router from "next/router";
import { useContext } from "react";
import { Project } from "../../pages/api/users";
import { UserContext } from "../../src/context/UserContext";
import { ActiveButtons } from "../../src/lib/utils";
import NavbarButton from "./NavbarButton";

const NavbarTab = dynamic(() => import("./NavbarTab"));

type Props = {
    activeButtons?: ActiveButtons;
    project?: Project;
};

const onLogIn = () => {
    Router.push("/login");
};

const onSignUp = () => {
    Router.push("/signup");
};

const onSettings = () => {
    Router.push("/settings");
};

const NotLoggedNavbar = () => (
    <div id="navbar-buttons">
        <NavbarButton content="Log in" action={onLogIn} />
        <NavbarButton content="Sign up" action={onSignUp} />
    </div>
);

const Navbar = ({ activeButtons, project }: Props) => {
    const { user, updateUser } = useContext(UserContext);
    const onLogOut = async () => {
        await fetch("/api/logout");
        updateUser(undefined);
        Router.push("/");
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
