"use client";

import { useTranslations } from "next-intl";
import { Files, LayoutGrid, LucideIcon, Rows3 } from "lucide-react";
import { ScreenplayViewMode, useViewContext } from "@src/context/ViewContext";
import { join } from "@src/lib/utils/misc";

import styles from "./PanelMenu.module.css";

type ViewModeKey = "viewScript" | "viewIndexCards" | "viewPages";

// The first two glyphs are the same rounded square subdivided differently —
// lines for the running script, cells for the card grid — so the row reads as
// one control with several settings rather than as unrelated buttons. The third
// steps out of that family on purpose: the page wall is not another way of
// subdividing the panel, it is the script's own sheets of paper, and a stack of
// them says so where a fourth kind of grid would just be another grid.
const VIEW_MODES: { mode: ScreenplayViewMode; icon: LucideIcon; labelKey: ViewModeKey }[] = [
    { mode: "editor", icon: Rows3, labelKey: "viewScript" },
    { mode: "cards", icon: LayoutGrid, labelKey: "viewIndexCards" },
    { mode: "pages", icon: Files, labelKey: "viewPages" },
];

/**
 * Icon row choosing how the screenplay is rendered: the script in the editor
 * (the default), the scene index cards, or every page at once.
 *
 * Icon-only because these are alternatives to each other rather than a list of
 * commands — a row of exclusive states reads at a glance where stacked labelled
 * rows would not. The panel menu only renders it over a screenplay panel, since
 * it means nothing over a board or the title page.
 */
const ScreenplayViewSwitcher = ({ size = 16, onSelect }: { size?: number; onSelect?: () => void }) => {
    const t = useTranslations("navbar");
    const { screenplayView, setScreenplayView } = useViewContext();

    return (
        <div className={styles.icon_row}>
            {VIEW_MODES.map(({ mode, icon: Icon, labelKey }) => {
                const isActive = screenplayView === mode;
                return (
                    <button
                        key={mode}
                        type="button"
                        className={join(styles.icon_btn, isActive ? styles.icon_btn_active : "")}
                        title={t(labelKey)}
                        aria-label={t(labelKey)}
                        aria-pressed={isActive}
                        onClick={() => {
                            setScreenplayView(mode);
                            onSelect?.();
                        }}
                    >
                        <Icon size={size} />
                    </button>
                );
            })}
        </div>
    );
};

export default ScreenplayViewSwitcher;
