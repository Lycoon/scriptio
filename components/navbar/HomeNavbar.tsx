"use client";

import { useContext } from "react";
import { DashboardContext } from "@src/context/DashboardContext";
import { Settings } from "lucide-react";
import { join } from "@src/lib/utils/misc";

import Logo from "@public/images/scriptio.svg"

import navbar from "./ProjectNavbar.module.css";
import navBtn from "@components/utils/NavbarIconButton.module.css";

const HomeNavbar = () => {
    const { openDashboard } = useContext(DashboardContext);

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
                <div className={navBtn.button} onClick={() => openDashboard("Profile")}>
                    <Settings size={18} />
                </div>
            </div>
        </nav>
    );
};

export default HomeNavbar;
