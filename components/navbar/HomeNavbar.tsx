"use client";

import { useContext } from "react";
import { DashboardContext } from "@src/context/DashboardContext";
import { Menu, Settings } from "lucide-react";
import { join } from "@src/lib/utils/misc";
import { useCookieUser, useIsPhone } from "@src/lib/utils/hooks";
import { useTranslations } from "next-intl";

import Logo from "@public/images/scriptio.svg"

import navbar from "./ProjectNavbar.module.css";
import navBtn from "@components/utils/NavbarIconButton.module.css";

interface HomeNavbarProps {
    /** Phone only: opens the projects sidebar drawer (the burger lives here now). */
    onOpenSidebar?: () => void;
}

const HomeNavbar = ({ onOpenSidebar }: HomeNavbarProps) => {
    const { openDashboard } = useContext(DashboardContext);
    const { user, isLoading } = useCookieUser();
    const isPhone = useIsPhone();
    const tNav = useTranslations("navbar");

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
        <nav className={join(navbar.container, navbar.home_container)}>
            {/* Left side: the logo on desktop; on phone the logo lives in the
                sidebar drawer instead, so the bar shows the burger that opens it.
                On phone the button sits in the same rounded pill as the project
                navbar's clusters so the two bars' icons read at the same size. */}
            <div className={navbar.left_btns}>
                {isPhone ? (
                    <div className={navbar.mobile_left}>
                        <button
                            className={join(navBtn.button, navbar.mobile_icon, navbar.home_burger)}
                            onClick={onOpenSidebar}
                            aria-label={tNav("menu")}
                        >
                            <Menu size={18} />
                        </button>
                    </div>
                ) : (
                    <Logo className={navbar.logo} />
                )}
            </div>

            {/* Center - empty on home page */}
            <div></div>

            {/* Right side - settings (same pill as the project navbar on phone). */}
            <div className={navbar.right_btns}>
                {isPhone ? (
                    <div className={navbar.mobile_right}>
                        <div className={join(navBtn.button, navbar.mobile_icon)} onClick={onOpen}>
                            <Settings size={18} />
                        </div>
                    </div>
                ) : (
                    <div className={navBtn.button} onClick={onOpen}>
                        <Settings size={18} />
                    </div>
                )}
            </div>
        </nav>
    );
};

export default HomeNavbar;
