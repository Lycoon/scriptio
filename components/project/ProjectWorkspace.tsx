"use client";

import { useState } from "react";
import { useViewContext } from "@src/context/ViewContext";
import EditorSidebarNavigation from "@components/editor/sidebar/EditorSidebarNavigation";
import EditorSidebarFormat from "@components/editor/sidebar/EditorSidebarFormat";
import ContextMenu from "@components/editor/sidebar/ContextMenu";
import SuggestionMenu, { SuggestionData } from "@components/editor/SuggestionMenu";
import { Popup } from "@components/popup/Popup";
import SplitPanelContainer from "./SplitPanelContainer";
import styles from "./ProjectWorkspace.module.css";
import { ChevronLeft, ChevronRight } from "lucide-react";

const ProjectWorkspace = () => {
    const { rightSidebarOpen, setRightSidebarOpen } = useViewContext();

    const [suggestions, updateSuggestions] = useState<string[]>([]);
    const [suggestionData, updateSuggestionData] = useState<SuggestionData>({
        position: { x: 0, y: 0 },
        cursor: 0,
        cursorInNode: 0,
    });

    return (
        <div className={styles.workspace}>
            {/* Overlays */}
            <ContextMenu />
            {suggestions.length > 0 && <SuggestionMenu suggestions={suggestions} suggestionData={suggestionData} onSelect={() => updateSuggestions([])} />}
            <Popup />

            {/* Left sidebar */}
            <EditorSidebarNavigation />

            {/* Panel container */}
            <div className={styles.panel_area}>
                <SplitPanelContainer
                    suggestions={suggestions}
                    updateSuggestions={updateSuggestions}
                    suggestionData={suggestionData}
                    updateSuggestionData={updateSuggestionData}
                />
            </div>

            {/* Right sidebar toggle */}
            <div className={styles.right_sidebar_toggle} onClick={() => setRightSidebarOpen((prev) => !prev)}>
                {rightSidebarOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </div>

            {/* Right sidebar */}
            <EditorSidebarFormat />
        </div>
    );
};

export default ProjectWorkspace;
