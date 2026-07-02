"use client";

import { useState } from "react";
import { useViewContext } from "@src/context/ViewContext";
import { useIsPhone } from "@src/lib/utils/hooks";
import EditorSidebarNavigation from "@components/editor/sidebar/EditorSidebarNavigation";
import EditorSidebarFormat from "@components/editor/sidebar/EditorSidebarFormat";
import ContextMenu from "@components/editor/sidebar/ContextMenu";
import SuggestionMenu, { SuggestionData } from "@components/editor/SuggestionMenu";
import { Popup } from "@components/popup/Popup";
import SplitPanelContainer from "./SplitPanelContainer";
import EditorFooter from "./EditorFooter";
import styles from "./ProjectWorkspace.module.css";
import { ChevronLeft, ChevronRight } from "lucide-react";

const ProjectWorkspace = () => {
    const { leftSidebarOpen, setLeftSidebarOpen, rightSidebarOpen, setRightSidebarOpen } = useViewContext();
    const isPhone = useIsPhone();

    // On phone the sidebars slide over the editor as drawers; a backdrop dims the
    // editor and gives a tap-anywhere-to-close target.
    const showBackdrop = isPhone && (leftSidebarOpen || rightSidebarOpen);
    const closeSidebars = () => {
        setLeftSidebarOpen(false);
        setRightSidebarOpen(false);
    };

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

                {/* Right sidebar toggle (desktop/tablet only — phone uses the navbar arrow) */}
                <div className={styles.right_sidebar_toggle} onClick={() => setRightSidebarOpen((prev) => !prev)}>
                    {rightSidebarOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </div>

                {/* Phone drawer backdrop */}
                {showBackdrop && <div className={styles.sidebar_backdrop} onClick={closeSidebars} />}

                {/* Floating page-count + view-mode bubbles */}
                <EditorFooter />
            </div>

            {/* Right sidebar */}
            <EditorSidebarFormat />
        </div>
    );
};

export default ProjectWorkspace;
