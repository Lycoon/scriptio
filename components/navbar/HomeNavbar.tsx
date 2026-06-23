"use client";

import { useContext } from "react";
import { DashboardContext } from "@src/context/DashboardContext";
import { Settings } from "lucide-react";
import { join } from "@src/lib/utils/misc";
import { useCookieUser } from "@src/lib/utils/hooks";

import Logo from "@public/images/scriptio.svg"

import navbar from "./ProjectNavbar.module.css";
import navBtn from "@components/utils/NavbarIconButton.module.css";

const HomeNavbar = () => {
    const { openDashboard } = useContext(DashboardContext);
    const { user, isLoading } = useCookieUser();

    // Pick a tab the user can actually see: Profile only renders when signed in,
    // Auth only when signed out. Defaulting to "Profile" unconditionally would
    // make the dashboard's auto-switch bounce signed-out visitors to Keybinds.
    // While the auth state is still loading, omit the tab arg so the modal
    // opens on its current activeTab instead of guessing wrong.
    const onOpen = () => {
        if (isLoading) openDashboard();
        else openDashboard(user ? "Profile" : "Auth");
    };

    return (
        <nav className={join(navbar.container)}>
            {/* Left side - could add logo or app name */}
            <div className={navbar.left_btns}>
                <Logo className={navbar.logo} />
            </div>

            {/* Center - empty on home page */}
            <div></div>

            {/* Right side - settings */}
            <div className={navbar.right_btns}>
                <div className={navBtn.button} onClick={onOpen}>
                    <Settings size={18} />
                </div>
            </div>
        </nav>
    );
};

export default HomeNavbar;
