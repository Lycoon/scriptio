"use client";

import { useEffect, useState, ReactNode } from "react";
import { BarChart2, Clapperboard, Users, MapPin, FileBarChart, X } from "lucide-react";

import ScenesStats from "./stats/ScenesStats";
import CharactersStats from "./stats/CharactersStats";
import LocationsStats from "./stats/LocationsStats";

import styles from "./AnalyticsModal.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type AnalyticsTab = "scenes" | "characters" | "locations" | "reports";

interface MenuItem {
    id: AnalyticsTab;
    label: string;
    icon: ReactNode;
}

interface MenuSection {
    group: string;
    items: MenuItem[];
}

// ── Sidebar data ──────────────────────────────────────────────────────────────

const MENU: MenuSection[] = [
    {
        group: "Statistics",
        items: [
            { id: "scenes",     label: "Scenes",     icon: <Clapperboard size={16} /> },
            { id: "characters", label: "Characters", icon: <Users        size={16} /> },
            { id: "locations",  label: "Locations",  icon: <MapPin       size={16} /> },
        ],
    },
    {
        group: "Reports",
        items: [
            { id: "reports", label: "Reports", icon: <FileBarChart size={16} /> },
        ],
    },
];

// ── Tab titles ────────────────────────────────────────────────────────────────

const TAB_TITLES: Record<AnalyticsTab, string> = {
    scenes:     "Scenes",
    characters: "Characters",
    locations:  "Locations",
    reports:    "Reports",
};

// ── Reports placeholder ───────────────────────────────────────────────────────

function ReportsPlaceholder() {
    return (
        <div className={styles.comingSoon}>
            <FileBarChart />
            <p>Reports coming soon</p>
        </div>
    );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AnalyticsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AnalyticsModal({ isOpen, onClose }: AnalyticsModalProps) {
    const [activeTab, setActiveTab] = useState<AnalyticsTab>("scenes");

    // ESC key closes the modal
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>

                {/* ── Sidebar ──────────────────────────────────────────────── */}
                <aside className={styles.sidebar}>
                    <h2 className={styles.sidebarTitle}>
                        <BarChart2 size={18} style={{ display: "inline", marginRight: 8, verticalAlign: "middle" }} />
                        Analytics
                    </h2>

                    <nav className={styles.navMenu}>
                        {MENU.map((section) => (
                            <div key={section.group}>
                                <h4 className={styles.groupLabel}>{section.group}</h4>
                                {section.items.map((item) => (
                                    <button
                                        key={item.id}
                                        className={`${styles.navItem} ${activeTab === item.id ? styles.active : ""}`}
                                        onClick={() => setActiveTab(item.id)}
                                    >
                                        <span className={styles.iconWrapper}>{item.icon}</span>
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </nav>
                </aside>

                {/* ── Content area ─────────────────────────────────────────── */}
                <div className={styles.content}>
                    <header className={styles.contentHeader}>
                        <h3>{TAB_TITLES[activeTab]}</h3>
                        <X className={styles.close_btn} onClick={onClose} />
                    </header>

                    <div className={styles.scrollArea}>
                        {activeTab === "scenes"     && <ScenesStats />}
                        {activeTab === "characters" && <CharactersStats />}
                        {activeTab === "locations"  && <LocationsStats />}
                        {activeTab === "reports"    && <ReportsPlaceholder />}
                    </div>
                </div>

            </div>
        </div>
    );
}
