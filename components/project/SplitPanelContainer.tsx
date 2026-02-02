"use client";

import { useMemo } from "react";
import { PanelType, useViewContext } from "@src/context/ViewContext";
import EditorPanel from "@components/editor/EditorPanel";
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
    suggestions,
    updateSuggestions,
    suggestionData,
    updateSuggestionData,
}: { panel: PanelType } & SplitPanelContainerProps) => {
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
            return <BoardCanvas />;
        case "statistics":
            return <StatisticsClientPage />;
    }
};

const SplitPanelContainer = ({
    suggestions,
    updateSuggestions,
    suggestionData,
    updateSuggestionData,
}: SplitPanelContainerProps) => {
    const { primaryPanel, secondaryPanel, splitRatio, isSplit, mountedPanels, visiblePanels } = useViewContext();

    const gridStyle = useMemo(() => {
        if (!isSplit) {
            return { gridTemplateColumns: "1fr" };
        }
        return {
            gridTemplateColumns: `${splitRatio}fr 6px ${1 - splitRatio}fr`,
        };
    }, [isSplit, splitRatio]);

    const allPanels: PanelType[] = ["screenplay", "board", "statistics"];

    return (
        <div className={styles.split_panel_container} style={gridStyle}>
            {allPanels.map((panel) => {
                if (!mountedPanels.has(panel)) return null;

                const isPrimary = panel === primaryPanel;
                const isSecondary = panel === secondaryPanel;
                const isVisible = isPrimary || isSecondary;

                return (
                    <div
                        key={panel}
                        className={isVisible ? styles.panel : styles.panel_hidden}
                        style={isVisible ? { order: isPrimary ? 0 : 2 } : undefined}
                    >
                        <PanelRenderer
                            panel={panel}
                            suggestions={suggestions}
                            updateSuggestions={updateSuggestions}
                            suggestionData={suggestionData}
                            updateSuggestionData={updateSuggestionData}
                        />
                    </div>
                );
            })}
            {isSplit && <div style={{ order: 1, height: "100%" }}><DragHandle /></div>}
        </div>
    );
};

export default SplitPanelContainer;
