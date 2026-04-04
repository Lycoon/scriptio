"use client";

import { ReactNode, useContext, useState } from "react";
import { mutate } from "swr";
import { DashboardContext } from "@src/context/DashboardContext";
import { Info, LogIn, LogOut, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import styles from "./DashboardModal.module.css";
import dangerStyles from "./project/DangerZone.module.css";
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
    | "Subscription"
    | "Settings"
    | "Keybinds"
    | "Appearance"
    | "Language"
    | "Login"
    | "Signup"
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
    const [showLogOutConfirm, setShowLogOutConfirm] = useState(false);

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
        <>
            {showLogOutConfirm && (
                <div className={dangerStyles.overlay} onClick={() => setShowLogOutConfirm(false)}>
                    <div className={dangerStyles.modal} onClick={(e) => e.stopPropagation()}>
                        <h2 className={dangerStyles.modalTitle}>{t("logOutConfirmTitle")}</h2>
                        <p className={dangerStyles.modalDescription}>{t("logOutConfirmDesc")}</p>
                        <div className={dangerStyles.modalActions}>
                            <button
                                className={`${dangerStyles.modalBtn} ${dangerStyles.modalBtnDanger}`}
                                onClick={onLogOut}
                            >
                                {t("logOutConfirmBtn")}
                            </button>
                            <button
                                className={`${dangerStyles.modalBtn} ${dangerStyles.modalBtnCancel}`}
                                onClick={() => setShowLogOutConfirm(false)}
                            >
                                {t("logOutCancelBtn")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
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
                        <button className={styles.navItem} onClick={() => setShowLogOutConfirm(true)}>
                            <LogOut size={18} />
                            {t("logOut")}
                        </button>
                    ) : (
                        <>
                            <button
                                className={`${styles.navItem} ${activeTab === "Login" ? styles.active : ""}`}
                                onClick={() => onTabChange("Login")}
                            >
                                <LogIn size={18} />
                                {t("logIn")}
                            </button>
                            <button
                                className={`${styles.navItem} ${activeTab === "Signup" ? styles.active : ""}`}
                                onClick={() => onTabChange("Signup")}
                            >
                                <UserPlus size={18} />
                                {t("signUp")}
                            </button>
                        </>
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
        </>
    );
};

export default SidebarMenu;
