"use client";

import { useContext, useState } from "react";
import { UserContext } from "@src/context/UserContext";
import { useViewContext } from "@src/context/ViewContext";
import EditorSidebarNavigation from "@components/editor/sidebar/EditorSidebarNavigation";
import EditorSidebarFormat from "@components/editor/sidebar/EditorSidebarFormat";
import ContextMenu from "@components/editor/sidebar/ContextMenu";
import SuggestionMenu, { SuggestionData } from "@components/editor/SuggestionMenu";
import { Popup } from "@components/popup/Popup";
import SplitPanelContainer from "./SplitPanelContainer";
import styles from "./ProjectWorkspace.module.css";

const ProjectWorkspace = () => {
    const { isZenMode } = useContext(UserContext);
    const { visiblePanels } = useViewContext();

    const hasScreenplay = visiblePanels.includes("screenplay");

    const [suggestions, updateSuggestions] = useState<string[]>([]);
    const [suggestionData, updateSuggestionData] = useState<SuggestionData>({
        position: { x: 0, y: 0 },
        cursor: 0,
        cursorInNode: 0,
    });

    return (
        <div className={`${styles.workspace} ${!isZenMode ? styles.sidebars_visible : ""}`}>
            {/* Overlays */}
            <ContextMenu />
            {suggestions.length > 0 && <SuggestionMenu suggestions={suggestions} suggestionData={suggestionData} />}
            <Popup />

            {/* Left sidebar - only show when screenplay is visible */}
            {hasScreenplay && <EditorSidebarNavigation />}

            {/* Panel container */}
            <SplitPanelContainer
                suggestions={suggestions}
                updateSuggestions={updateSuggestions}
                suggestionData={suggestionData}
                updateSuggestionData={updateSuggestionData}
            />

            {/* Right sidebar - only show when screenplay is visible */}
            {hasScreenplay && <EditorSidebarFormat />}
        </div>
    );
};

export default ProjectWorkspace;
