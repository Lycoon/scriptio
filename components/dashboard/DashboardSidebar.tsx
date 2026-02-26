"use client";

import { ReactNode, useContext } from "react";
import { mutate } from "swr";
import { DashboardContext } from "@src/context/DashboardContext";
import { Info, LogIn, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

import styles from "./DashboardModal.module.css";
import { redirect } from "next/navigation";
import { logout } from "@src/lib/utils/requests";
import { isTauri } from "@tauri-apps/api/core";
import { useCookieUser } from "@src/lib/utils/hooks";

export type Category =
    | "General"
    | "Layout"
    | "Export"
    | "Collaborators"
    | "Profile"
    | "Security"
    | "Settings"
    | "Keybinds"
    | "Appearance"
    | "Language"
    | "Login"
    | "About";

export interface MenuItem {
    id: Category;
    label: string;
    icon: ReactNode;
}

export interface MenuSection {
    group: string;
    items: MenuItem[];
}

interface SidebarMenuProps {
    structure: MenuSection[];
    activeTab: Category;
    onTabChange: (id: Category) => void;
}

const SidebarMenu = ({ structure, activeTab, onTabChange }: SidebarMenuProps) => {
    const { closeDashboard } = useContext(DashboardContext);
    const { user } = useCookieUser();
    const t = useTranslations("sidebar");
    const tModal = useTranslations("modal");

    const onLogOut = async () => {
        await logout();

        // On desktop, clear the stored JWT token
        if (isTauri()) {
            const { clearDesktopToken } = await import("@src/lib/desktop-auth");
            await clearDesktopToken();
        }

        await mutate("/api/users/cookie", undefined);
        closeDashboard();
        redirect("/");
    };

    return (
        <aside className={styles.sidebar}>
            <h2 className={styles.sidebarTitle}>{t("title")}</h2>
            <nav className={styles.navMenu}>
                {structure.map((section) => (
                    <div key={section.group}>
                        <h4 className={styles.groupLabel}>{section.group}</h4>
                        {section.items.map((item) => (
                            <button
                                key={item.id}
                                className={`${styles.navItem} ${activeTab === item.id ? styles.active : ""}`}
                                onClick={() => onTabChange(item.id)}
                            >
                                <span className={styles.iconWrapper}>{item.icon}</span>
                                {item.label}
                            </button>
                        ))}
                    </div>
                ))}
            </nav>
            <div className={styles.navMenu} style={{ marginTop: "auto" }}>
                {user ? (
                    <button className={styles.navItem} onClick={onLogOut}>
                        <LogOut size={18} />
                        {t("logOut")}
                    </button>
                ) : (
                    <button className={styles.navItem} onClick={() => onTabChange("Login")}>
                        <LogIn size={18} />
                        {t("logIn")}
                    </button>
                )}
                <button
                    className={`${styles.navItem} ${activeTab === "About" ? styles.active : ""}`}
                    onClick={() => onTabChange("About")}
                >
                    <Info size={18} />
                    {tModal("tabs.About")}
                </button>
            </div>
        </aside>
    );
};

export default SidebarMenu;
