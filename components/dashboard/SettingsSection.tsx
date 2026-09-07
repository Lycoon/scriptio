"use client";

import { ReactNode, useState } from "react";
import { ChevronRight } from "lucide-react";

import styles from "./project/ProjectSettings.module.css";

/**
 * A collapsible settings section: a clickable heading that folds its body away.
 *
 * Shared by the dashboard's settings panels so a fold behaves and reads the same
 * wherever it appears. Keep it at module scope in whatever imports it — declared
 * inside a component, its open/closed state would be thrown away on every
 * re-render of the parent.
 */
const SettingsSection = ({
    title,
    defaultOpen = false,
    children,
}: {
    title: string;
    defaultOpen?: boolean;
    children: ReactNode;
}) => {
    const [open, setOpen] = useState(defaultOpen);
    const toggle = () => setOpen((prev) => !prev);
    return (
        <div className={styles.formGroup}>
            <div
                className={styles.sectionHeader}
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onClick={toggle}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle();
                    }
                }}
            >
                <span className={styles.sectionTitle}>{title}</span>
                <ChevronRight size={16} className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} />
            </div>
            {open && <div className={styles.sectionBody}>{children}</div>}
        </div>
    );
};

export default SettingsSection;
