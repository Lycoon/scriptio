"use client";

import { ReactNode, useContext } from "react";
import { mutate } from "swr";
import { DashboardContext } from "@src/context/DashboardContext";
import { LogOut } from "lucide-react";

import styles from "./DashboardModal.module.css";
import { redirect } from "next/navigation";
import { logout } from "@src/lib/utils/requests";

export type Category =
    | "General"
    | "Export"
    | "Collaborators"
    | "Profile"
    | "Security"
    | "Settings"
    | "Keybinds"
    | "Appearance";

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

    const onLogOut = async () => {
        await logout();
        await mutate("/api/users/cookie", undefined);
        closeDashboard();
        redirect("/");
    };

    return (
        <aside className={styles.sidebar}>
            <h2 className={styles.sidebarTitle}>Dashboard</h2>
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
                <button className={styles.navItem} onClick={onLogOut}>
                    <LogOut size={18} />
                    Log Out
                </button>
            </div>
        </aside>
    );
};

export default SidebarMenu;
