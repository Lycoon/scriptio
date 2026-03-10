"use client";

import { useContext } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { DashboardContext } from "@src/context/DashboardContext";
import { useCookieUser } from "@src/lib/utils/hooks";
import { Settings } from "lucide-react";
import { join } from "@src/lib/utils/misc";

import Logo from "@public/images/scriptio.svg"

import navbar from "./ProjectNavbar.module.css";
import navBtn from "@components/utils/NavbarIconButton.module.css";

const HomeNavbar = () => {
    const { openDashboard } = useContext(DashboardContext);
    const { user } = useCookieUser();

    // On desktop (Tauri), allow navbar without user for offline mode
    if (!user && !isTauri()) return null;

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
                <div className={navBtn.button} onClick={() => openDashboard("Profile")} style={{ height: "100%", paddingInline: "10px", gap: "12px" }}>
                    <Settings size={18} />
                </div>
            </div>
        </nav>
    );
};

export default HomeNavbar;
