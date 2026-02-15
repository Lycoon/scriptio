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
            return <TitlePagePanel />;
    }
};

const SplitPanelContainer = ({
    suggestions,
    updateSuggestions,
    suggestionData,
    updateSuggestionData,
}: SplitPanelContainerProps) => {
    const { primaryPanel, secondaryPanel, splitRatio, isSplit } = useViewContext();

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
            gridTemplateColumns: `${leftPct}% 6px ${rightPct}%`,
        };
    }, [isSplit, splitRatio]);

    const allPanels: PanelType[] = ["screenplay", "board", "statistics", "title"];

    return (
        <div className={styles.split_panel_container} style={gridStyle}>
            {allPanels.map((panel) => {
                const isPrimary = panel === primaryPanel;
                const isSecondary = panel === secondaryPanel;
                const isVisible = isPrimary || isSecondary;

                if (!isVisible) return null;

                return (
                    <div key={panel} className={styles.panel} style={{ order: isPrimary ? 0 : 2 }}>
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
