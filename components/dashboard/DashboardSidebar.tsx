import { ReactNode } from "react";
import styles from "./DashboardModal.module.css";

export type Category = "General" | "Export" | "Collaborators" | "Profile" | "Security" | "Settings";

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
    return (
        <aside className={styles.sidebar}>
            <h2 className={styles.sidebarTitle}>Dashboard</h2>
            <nav className={styles.navMenu}>
                {structure.map((section) => (
                    <div key={section.group} className={styles.menuGroup}>
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
        </aside>
    );
};

export default SidebarMenu;
