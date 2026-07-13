"use client";

import { ReactNode, useContext, useState } from "react";
import { DashboardContext } from "@src/context/DashboardContext";
import { Info, LogIn, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

import styles from "./DashboardModal.module.css";
import dangerStyles from "./project/DangerZone.module.css";
import modal from "../utils/ModalBtn.module.css";
import { signOutAccount } from "@src/lib/utils/auth-actions";
import { useCookieUser } from "@src/lib/utils/hooks";

export type Category =
    | "General"
    | "Layout"
    | "Production"
    | "Export"
    | "Storage"
    | "Collaborators"
    | "Profile"
    | "Subscription"
    | "Settings"
    | "Keybinds"
    | "Appearance"
    | "Language"
    | "Auth"
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
    const { user, isLoading: isUserLoading } = useCookieUser();
    const t = useTranslations("sidebar");
    const tModal = useTranslations("modal");
    const [showLogOutConfirm, setShowLogOutConfirm] = useState(false);

    const onLogOut = async () => {
        await signOutAccount();
        closeDashboard();
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
                                className={`${modal.modalBtn} ${modal.modalBtnDanger}`}
                                onClick={onLogOut}
                            >
                                {t("logOutConfirmBtn")}
                            </button>
                            <button
                                className={`${modal.modalBtn} ${modal.modalBtnCancel}`}
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
                    {/* While the user query is in flight, leave the slot empty rather than
                        rendering a "Sign in" button against an unknown auth state — clicking
                        it during loading races the SWR resolution and ends up on Profile. */}
                    {isUserLoading ? null : user ? (
                        <button className={styles.navItem} onClick={() => setShowLogOutConfirm(true)}>
                            <LogOut size={18} />
                            {t("logOut")}
                        </button>
                    ) : (
                        <button
                            className={`${styles.navItem} ${activeTab === "Auth" ? styles.active : ""}`}
                            onClick={() => onTabChange("Auth")}
                        >
                            <LogIn size={18} />
                            {t("auth")}
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
        </>
    );
};

export default SidebarMenu;
