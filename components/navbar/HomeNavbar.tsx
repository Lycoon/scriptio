"use client";

import { useContext } from "react";
import { DashboardContext } from "@src/context/DashboardContext";
import { useCookieUser } from "@src/lib/utils/hooks";
import { Settings } from "lucide-react";
import { join } from "@src/lib/utils/misc";

import navbar from "./ProjectNavbar.module.css";

const HomeNavbar = () => {
    const { openDashboard } = useContext(DashboardContext);
    const { user } = useCookieUser();

    if (!user) return null;

    return (
        <nav className={join(navbar.container)}>
            {/* Left side - could add logo or app name */}
            <div className={navbar.left_btns}></div>

            {/* Center - empty on home page */}
            <div></div>

            {/* Right side - settings */}
            <div className={navbar.right_btns}>
                <div className={navbar.export_project_btn} onClick={() => openDashboard("Profile")}>
                    <Settings size={18} />
                </div>
            </div>
        </nav>
    );
};

export default HomeNavbar;
