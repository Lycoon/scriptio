"use client";

import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
 *
 * Rendered through a portal to <body>: the navbar is its own stacking context
 * (position:relative; z-index:50), so a drawer nested inside it can never rise
 * above the editor's floating chrome (scroll drag-handle, edit FAB) no matter its
 * z-index. At the body level its z-index applies against the whole page instead.
 */
const ProjectNavbarMobileMenu = ({ isOpen, onClose, children }: ProjectNavbarMobileMenuProps) => {
    const t = useTranslations("navbar");

    // Portals need `document`, which doesn't exist during SSR — render nothing
    // until mounted so the server and first client render agree.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted) return null;

    return createPortal(
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
        </>,
        document.body,
    );
};

export default ProjectNavbarMobileMenu;
