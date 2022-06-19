import Image from "next/image";
import Link from "next/link";
import Router from "next/router";
import { useContext } from "react";
import { Project } from "../../pages/api/users";
import { UserContext } from "../../src/context/UserContext";
import { ActiveButtons } from "../../src/lib/utils";
import NavbarButton from "./NavbarButton";
import NavbarTab from "./NavbarTab";

type Props = {
    activeButtons?: ActiveButtons;
    project?: Project;
};

const onLogIn = () => {
    Router.push("login");
};

const onSignUp = () => {
    Router.push("register");
};

const onSettings = () => {
    Router.push("settings");
};

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
                    ></NavbarTab>
                )}
            </div>
            {!user?.isLoggedIn ? (
                <div id="navbar-buttons">
                    <NavbarButton content="Log in" action={onLogIn} />
                    <NavbarButton content="Create account" action={onSignUp} />
                </div>
            ) : (
                <div id="navbar-buttons">
                    <NavbarButton content="Settings" action={onSettings} />
                    <NavbarButton content="Log out" action={onLogOut} />
                </div>
            )}
        </nav>
    );
};

export default Navbar;
