"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { UserContext } from "@src/context/UserContext";
import { PanelType, useViewContext } from "@src/context/ViewContext";
import EditorPanel from "@components/editor/EditorPanel";
import TitlePagePanel from "@components/editor/TitlePagePanel";
import BoardCanvas from "@components/board/BoardCanvas";
import StatisticsClientPage from "@components/projects/stats/StatisticsClientPage";
import DragHandle from "./DragHandle";
import { SuggestionData } from "@components/editor/SuggestionMenu";
import { Clapperboard, FileText, LayoutDashboard, Maximize, Menu, MessageSquare, MessageSquareOff, Minimize, Scroll } from "lucide-react";
import styles from "./SplitPanelContainer.module.css";
import dropdown from "@components/navbar/ViewOptionsDropdown.module.css";

interface SplitPanelContainerProps {
    suggestions: string[];
    updateSuggestions: (suggestions: string[]) => void;
    suggestionData: SuggestionData;
    updateSuggestionData: (data: SuggestionData) => void;
}

const PanelRenderer = ({
    panel,
    isVisible,
    suggestions,
    updateSuggestions,
    suggestionData,
    updateSuggestionData,
}: { panel: PanelType; isVisible: boolean } & SplitPanelContainerProps) => {
    switch (panel) {
        case "screenplay":
            return (
                <EditorPanel
                    isVisible={isVisible}
                    suggestions={suggestions}
                    updateSuggestions={updateSuggestions}
                    suggestionData={suggestionData}
                    updateSuggestionData={updateSuggestionData}
                />
            );
        case "board":
            return <BoardCanvas isVisible={isVisible} />;
        case "statistics":
            return <StatisticsClientPage />;
        case "title":
            return <TitlePagePanel isVisible={isVisible} />;
    }
};

const SWITCHABLE_PANELS: { type: PanelType; icon: typeof Clapperboard; labelKey: string }[] = [
    { type: "screenplay", icon: Clapperboard, labelKey: "screenplay" },
    { type: "board", icon: LayoutDashboard, labelKey: "board" },
    { type: "title", icon: FileText, labelKey: "titlePage" },
];

const PanelSwitcherMenu = ({ currentPanel, side }: { currentPanel: PanelType; side: "primary" | "secondary" }) => {
    const t = useTranslations("navbar");
    const { isZenMode, updateIsZenMode } = useContext(UserContext);
    const { setSidePanel, isEndlessScroll, setIsEndlessScroll, showComments, setShowComments, leftSidebarOpen, setLeftSidebarOpen, setRightSidebarOpen } = useViewContext();
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const sidebarsBeforeFocus = useRef<{ left: boolean; right: boolean } | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
        };
        window.addEventListener("mousedown", handleClickOutside);
        return () => window.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    const handleSelect = useCallback(
        (panel: PanelType) => {
            if (panel !== currentPanel) setSidePanel(side, panel);
            setIsOpen(false);
        },
        [currentPanel, side, setSidePanel],
    );

    const enterFocusMode = useCallback(() => {
        setLeftSidebarOpen((prev) => {
            setRightSidebarOpen((prevRight) => {
                sidebarsBeforeFocus.current = { left: prev, right: prevRight };
                return false;
            });
            return false;
        });
        updateIsZenMode(true);
        document.documentElement.requestFullscreen?.();
    }, [updateIsZenMode, setLeftSidebarOpen, setRightSidebarOpen]);

    const exitFocusMode = useCallback(() => {
        updateIsZenMode(false);
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
        if (sidebarsBeforeFocus.current) {
            setLeftSidebarOpen(sidebarsBeforeFocus.current.left);
            setRightSidebarOpen(sidebarsBeforeFocus.current.right);
            sidebarsBeforeFocus.current = null;
        }
    }, [updateIsZenMode, setLeftSidebarOpen, setRightSidebarOpen]);

    useEffect(() => {
        const onFullscreenChange = () => {
            if (!document.fullscreenElement && isZenMode) {
                exitFocusMode();
            }
        };
        document.addEventListener("fullscreenchange", onFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
    }, [isZenMode, exitFocusMode]);

    return (
        <div ref={ref} className={styles.panel_switcher_anchor} style={side === "primary" && !leftSidebarOpen ? { left: "28px" } : undefined}>
            <button className={styles.panel_switcher_btn} onClick={() => setIsOpen(!isOpen)}>
                <Menu size={14} />
            </button>
            {isOpen && (
                <div className={dropdown.dropdown_menu} style={{ left: 0, transform: "none" }}>
                    {SWITCHABLE_PANELS.map(({ type, icon: Icon, labelKey }) => (
                        <button
                            key={type}
                            className={`${dropdown.dropdown_item} ${type === currentPanel ? dropdown.dropdown_item_active : ""}`}
                            onClick={() => handleSelect(type)}
                        >
                            <Icon size={14} />
                            <span className={dropdown.item_label}>{t(labelKey as Parameters<typeof t>[0])}</span>
                        </button>
                    ))}
                    <div className={styles.panel_switcher_separator} />
                    <button
                        className={`${dropdown.dropdown_item} ${isEndlessScroll ? dropdown.dropdown_item_active : ""}`}
                        onClick={() => setIsEndlessScroll(!isEndlessScroll)}
                    >
                        <Scroll size={14} />
                        <span className={dropdown.item_label}>{t("endlessScroll")}</span>
                    </button>
                    <button
                        className={`${dropdown.dropdown_item} ${!showComments ? dropdown.dropdown_item_active : ""}`}
                        onClick={() => setShowComments(!showComments)}
                    >
                        {showComments ? <MessageSquare size={14} /> : <MessageSquareOff size={14} />}
                        <span className={dropdown.item_label}>{t("toggleComments")}</span>
                    </button>
                    <button
                        className={`${dropdown.dropdown_item} ${isZenMode ? dropdown.dropdown_item_active : ""}`}
                        onClick={isZenMode ? exitFocusMode : enterFocusMode}
                    >
                        {isZenMode ? <Minimize size={14} /> : <Maximize size={14} />}
                        <span className={dropdown.item_label}>{t("focusMode")}</span>
                    </button>
                </div>
            )}
        </div>
    );
};

const SplitPanelContainer = ({
    suggestions,
    updateSuggestions,
    suggestionData,
    updateSuggestionData,
}: SplitPanelContainerProps) => {
    const { primaryPanel, secondaryPanel, splitRatio, isSplit, mountedPanels, focusedSide, setFocusedSide } = useViewContext();

    const gridStyle = useMemo(() => {
        if (!isSplit) {
            return { gridTemplateColumns: "1fr" };
        }
        // Use calc() with percentages instead of fractional fr units.
        // Fractional fr values (e.g. 0.5fr) trigger expensive grid track
        // recalculations on every layout pass, causing editor freezes.
        const leftPct = splitRatio * 100;
        const rightPct = (1 - splitRatio) * 100;
        return {
            gridTemplateColumns: `calc(${leftPct}% - ${splitRatio * 6}px) 6px calc(${rightPct}% - ${(1 - splitRatio) * 6}px)`,
        };
    }, [isSplit, splitRatio]);

    const allPanels: PanelType[] = ["screenplay", "board", "statistics", "title"];

    return (
        <div className={styles.split_panel_container} style={gridStyle}>
            {allPanels.map((panel) => {
                const isPrimary = panel === primaryPanel;
                const isSecondary = panel === secondaryPanel;
                const isVisible = isPrimary || isSecondary;

                // Lazy mount: only render panels that have been visited at least once
                if (!mountedPanels.has(panel)) return null;

                const isFocused = isSplit && isVisible && (isPrimary ? focusedSide === "primary" : focusedSide === "secondary");
                const panelClass = !isVisible
                    ? styles.panel_hidden
                    : isFocused
                      ? `${styles.panel} ${styles.panel_focused}`
                      : styles.panel;

                return (
                    <div
                        key={panel}
                        className={panelClass}
                        style={isVisible ? { order: isPrimary ? 0 : 2, position: "relative" } : undefined}
                        onPointerDown={isVisible && isSplit ? () => setFocusedSide(isPrimary ? "primary" : "secondary") : undefined}
                    >
                        {isVisible && (
                            <PanelSwitcherMenu
                                currentPanel={panel}
                                side={isPrimary ? "primary" : "secondary"}
                            />
                        )}
                        <PanelRenderer
                            panel={panel}
                            isVisible={isVisible}
                            suggestions={suggestions}
                            updateSuggestions={updateSuggestions}
                            suggestionData={suggestionData}
                            updateSuggestionData={updateSuggestionData}
                        />
                    </div>
                );
            })}
            {isSplit && (
                <div style={{ order: 1, height: "100%" }}>
                    <DragHandle />
                </div>
            )}
        </div>
    );
};

export default SplitPanelContainer;
