"use client";

import { useEffect, useState, ComponentType, ReactNode } from "react";
import { createPortal } from "react-dom";
import { BarChart2, Clapperboard, Users, MapPin, FileBarChart, X } from "lucide-react";

import { useIsPhone } from "@src/lib/utils/hooks";

import ScenesStats from "./stats/ScenesStats";
import CharactersStats from "./stats/CharactersStats";
import LocationsStats from "./stats/LocationsStats";

import styles from "./AnalyticsModal.module.css";

// ── Reports placeholder ───────────────────────────────────────────────────────

function ReportsPlaceholder() {
    return (
        <div className={styles.comingSoon}>
            <FileBarChart />
            <p>Reports coming soon</p>
        </div>
    );
}

// ── Sections ──────────────────────────────────────────────────────────────────
// Every section is rendered at once, stacked in the scroll area and separated by
// its title — there is no tab state and no nav sidebar.

interface Section {
    id: string;
    label: string;
    icon: ReactNode;
    Content: ComponentType;
}

const SECTIONS: Section[] = [
    { id: "scenes",     label: "Scenes",     icon: <Clapperboard size={16} />, Content: ScenesStats      },
    { id: "characters", label: "Characters", icon: <Users        size={16} />, Content: CharactersStats  },
    { id: "locations",  label: "Locations",  icon: <MapPin       size={16} />, Content: LocationsStats   },
    { id: "reports",    label: "Reports",    icon: <FileBarChart size={16} />, Content: ReportsPlaceholder },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface AnalyticsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AnalyticsModal({ isOpen, onClose }: AnalyticsModalProps) {
    const [mounted, setMounted] = useState(false);
    const isPhone = useIsPhone();

    useEffect(() => setMounted(true), []);

    // ESC key closes the modal
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [isOpen, onClose]);

    if (!isOpen || !mounted) return null;

    const sections = SECTIONS.map(({ id, label, icon, Content }) => (
        <section key={id} className={styles.section}>
            <h4 className={styles.sectionTitle}>
                <span className={styles.iconWrapper}>{icon}</span>
                {label}
            </h4>
            <Content />
        </section>
    ));

    // ── Mobile ──────────────────────────────────────────────────────────────
    // A distinct layout that matches the other navbar tool sheets (Production,
    // Read-aloud, Saves): a full-width panel pinned below the navbar with a
    // compact header and a scrollable body. Kept separate from the desktop modal
    // because the structures don't overlap.
    if (isPhone) {
        return createPortal(
            <div className={styles.mobileOverlay} onClick={onClose}>
                <div className={styles.mobilePanel} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.mobileHeader}>
                        <span className={styles.mobileTitle}>
                            <BarChart2 size={15} />
                            Analytics
                        </span>
                        <button className={styles.mobileIconBtn} onClick={onClose} aria-label="Close">
                            <X size={16} />
                        </button>
                    </div>

                    <div className={styles.mobileScroll}>{sections}</div>
                </div>
            </div>,
            document.body,
        );
    }

    // ── Desktop ─────────────────────────────────────────────────────────────
    // Portal to <body> so the overlay's fixed positioning escapes the navbar's
    // transform/stacking context (which otherwise becomes its containing block).
    // The shell is sized exactly like the dashboard modal (see its stylesheet).
    return createPortal(
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.content}>
                    <header className={styles.contentHeader}>
                        <h3 className={styles.title}>
                            <BarChart2 size={18} />
                            Analytics
                        </h3>
                        <button className={styles.close_btn} onClick={onClose} aria-label="Close">
                            <X size={18} />
                        </button>
                    </header>

                    <div className={styles.scrollArea}>{sections}</div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
