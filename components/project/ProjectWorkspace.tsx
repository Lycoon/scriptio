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
import MobileFormatToolbar from "@components/editor/MobileFormatToolbar";
import styles from "./ProjectWorkspace.module.css";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { join } from "@src/lib/utils/misc";

const ProjectWorkspace = () => {
    const { leftSidebarOpen, setLeftSidebarOpen, rightSidebarOpen, setRightSidebarOpen, chromeHidden } = useViewContext();
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

                {/* Right sidebar toggle — an edge chevron on every platform */}
                <div
                    className={join(styles.right_sidebar_toggle, chromeHidden ? styles.chrome_hidden : "")}
                    onClick={() => setRightSidebarOpen((prev) => !prev)}
                >
                    {rightSidebarOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </div>

                {/* Phone drawer backdrop */}
                {showBackdrop && <div className={styles.sidebar_backdrop} onClick={closeSidebars} />}

                {/* Floating page-count + view-mode bubbles */}
                <EditorFooter />
            </div>

            {/* Right sidebar */}
            <EditorSidebarFormat />

            {/* Phone-only formatting bar above the on-screen keyboard */}
            <MobileFormatToolbar />
        </div>
    );
};

export default ProjectWorkspace;
