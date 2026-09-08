"use client";

import { createContext, ReactNode, useContext, useEffect, useId, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import styles from "./project/ProjectSettings.module.css";

/** Fold duration, kept in step with `.sectionFold`'s transition in the stylesheet. */
const FOLD_MS = 200;

/**
 * The single open slot shared by the sections of one [SettingsSectionGroup].
 *
 * `undefined` means no section has been picked yet, which is what lets a
 * `defaultOpen` section start open without writing to the group from its own
 * render; `null` means every section is folded.
 */
type SectionGroupValue = {
    openId: string | null | undefined;
    setOpenId: (id: string | null) => void;
};

const SectionGroupContext = createContext<SectionGroupValue | null>(null);

/**
 * Accordion container: the sections rendered inside share one open slot, so
 * opening one folds whichever was open. It renders the plain <div> the panel
 * wrapped its sections in before, so `className` carries the panel's own layout.
 */
export const SettingsSectionGroup = ({ className, children }: { className?: string; children: ReactNode }) => {
    const [openId, setOpenId] = useState<string | null | undefined>(undefined);
    const value = useMemo(() => ({ openId, setOpenId }), [openId]);
    return (
        <SectionGroupContext.Provider value={value}>
            <div className={className}>{children}</div>
        </SectionGroupContext.Provider>
    );
};

/**
 * A collapsible settings section: a clickable heading that folds its body away.
 *
 * Shared by the dashboard's settings panels so a fold behaves and reads the same
 * wherever it appears. Inside a [SettingsSectionGroup] the sections take turns —
 * only one is open at a time; on its own a section keeps its own open state.
 * Keep it at module scope in whatever imports it — declared inside a component,
 * its state would be thrown away on every re-render of the parent.
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
    const bodyId = useId();
    const group = useContext(SectionGroupContext);
    const [localOpen, setLocalOpen] = useState(defaultOpen);

    // In a group the open slot lives in the group; on its own the section owns it.
    // Until the group has been touched every section still answers with its own
    // `defaultOpen`, so a section can start open without racing the others.
    const open = group ? (group.openId === undefined ? defaultOpen : group.openId === bodyId) : localOpen;

    // The body has to be clipped while it folds, but an open section must not cut
    // off content that legitimately escapes it — an open dropdown menu hangs past
    // the body's bottom edge. So clip whenever closed, and only for the length of
    // the animation when opening. A timer rather than `transitionend`, which never
    // fires when the transition is off (reduced motion). The tick is bumped on
    // every toggle, so a re-toggle mid-animation is timed from itself.
    const [foldingTick, setFoldingTick] = useState(0);
    useEffect(() => {
        if (!foldingTick) return;
        const timer = setTimeout(() => setFoldingTick(0), FOLD_MS);
        return () => clearTimeout(timer);
    }, [foldingTick]);

    const toggle = () => {
        setFoldingTick((tick) => tick + 1);
        if (group) group.setOpenId(open ? null : bodyId);
        else setLocalOpen((prev) => !prev);
    };

    return (
        <div className={styles.section}>
            <div
                className={styles.sectionHeader}
                role="button"
                tabIndex={0}
                aria-expanded={open}
                aria-controls={bodyId}
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
            {/* The body stays mounted so the fold animates in both directions;
                `inert` keeps a folded one out of the tab order and off screen
                readers, which `display: none` used to do for free. */}
            <div
                id={bodyId}
                className={`${styles.sectionFold} ${open ? styles.sectionFoldOpen : ""}`}
                inert={!open}
            >
                <div className={`${styles.sectionClip} ${open && !foldingTick ? styles.sectionClipOff : ""}`}>
                    <div className={styles.sectionBody}>{children}</div>
                </div>
            </div>
        </div>
    );
};

export default SettingsSection;
