"use client";

import { ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { join } from "@src/lib/utils/misc";

import menu from "./ProjectNavbarMobileMenu.module.css";

interface ProjectNavbarMobileMenuProps {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
}

/**
 * Slide-in drawer opened by the phone navbar's burger button. It's a presentational
 * shell: the parent navbar fills it with the actions that the desktop navbar spreads
 * across the bar (title, status, saves, production, read aloud, analytics, settings),
 * so all that state stays in one place.
 */
const ProjectNavbarMobileMenu = ({ isOpen, onClose, children }: ProjectNavbarMobileMenuProps) => {
    const t = useTranslations("navbar");

    return (
        <>
            {isOpen && <div className={menu.backdrop} onClick={onClose} />}
            <div className={join(menu.drawer, !isOpen ? menu.drawer_closed : "")}>
                <div className={menu.header}>
                    <span className={menu.header_title}>{t("menu")}</span>
                    <button className={menu.close_btn} onClick={onClose} aria-label={t("close")}>
                        <X size={18} />
                    </button>
                </div>
                {children}
            </div>
        </>
    );
};

export default ProjectNavbarMobileMenu;
