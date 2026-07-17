"use client";

import { join } from "@src/lib/utils/misc";
import { useIsPhone } from "@src/lib/utils/hooks";

import navbar from "./ProjectNavbar.module.css";
import navBtn from "@components/utils/NavbarIconButton.module.css";
import skeleton from "./ProjectNavbarSkeleton.module.css";

/**
 * Placeholder that mirrors the ProjectNavbar layout (same container height and
 * islands) while a project is resolving. Rendering it in the loading state keeps
 * the navbar bar reserved, so the real navbar fills in place without the layout
 * jumping down once loading finishes.
 *
 * Mirrors the same phone/desktop branch as [ProjectNavbar] so the skeleton
 * matches whichever navbar mounts — on phone that's the two floating pill
 * clusters of [ProjectNavbarMobile], not the desktop islands (which would
 * overflow and stack on a narrow screen).
 */
const ProjectNavbarSkeleton = () => {
    const isPhone = useIsPhone();

    const iconBtn = (key: string) => (
        <div key={key} className={navBtn.button}>
            <div className={join(skeleton.icon, skeleton.pulse)} />
        </div>
    );

    if (isPhone) {
        // Flush icons on the pill, matching ProjectNavbarMobile's .mobile_icon.
        const mobileIcon = (key: string) => (
            <div key={key} className={`${navBtn.button} ${navbar.mobile_icon}`}>
                <div className={join(skeleton.icon, skeleton.pulse)} />
            </div>
        );

        return (
            <nav className={navbar.container}>
                <nav className={navbar.mobile_bar}>
                    {/* Left pill: back arrow. Right pill: search + burger. */}
                    <div className={navbar.mobile_left}>{mobileIcon("back")}</div>
                    <div className={navbar.mobile_right}>{["search", "menu"].map(mobileIcon)}</div>
                </nav>
            </nav>
        );
    }

    return (
        <nav className={navbar.container}>
            {/* Left - back button, status/title island, panel buttons */}
            <nav className={navbar.left_btns}>
                <div className={navbar.back_btn}>
                    <div className={join(skeleton.icon, skeleton.pulse)} />
                </div>
                <div className={navbar.navBtns}>
                    <div className={navbar.navbar_island}>
                        <div className={join(skeleton.circle, skeleton.pulse)} />
                        <div className={join(skeleton.title, skeleton.pulse)} />
                    </div>
                    {["saves", "production", "readaloud"].map(iconBtn)}
                </div>
            </nav>

            {/* Center - format dropdown island */}
            <div className={navbar.center}>
                <div className={navbar.navbar_island}>
                    <div className={join(skeleton.dropdown, skeleton.pulse)} />
                </div>
            </div>

            {/* Right - search + settings buttons */}
            <div className={navbar.right_btns}>
                <div className={join(skeleton.search, skeleton.pulse)} />
                {["analytics", "settings"].map(iconBtn)}
            </div>
        </nav>
    );
};

export default ProjectNavbarSkeleton;
