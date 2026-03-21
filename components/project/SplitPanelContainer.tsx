"use client";

import { useMemo } from "react";
import { PanelType, useViewContext } from "@src/context/ViewContext";
import EditorPanel from "@components/editor/EditorPanel";
import TitlePagePanel from "@components/editor/TitlePagePanel";
import BoardCanvas from "@components/board/BoardCanvas";
import StatisticsClientPage from "@components/projects/stats/StatisticsClientPage";
import DragHandle from "./DragHandle";
import { SuggestionData } from "@components/editor/SuggestionMenu";
import styles from "./SplitPanelContainer.module.css";

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
                        style={isVisible ? { order: isPrimary ? 0 : 2 } : undefined}
                        onPointerDown={isVisible && isSplit ? () => setFocusedSide(isPrimary ? "primary" : "secondary") : undefined}
                    >
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
