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
import navBtn from "@components/utils/NavbarIconButton.module.css";
import { MessageSquare, MessageSquareOff, Scroll } from "lucide-react";
import { useTranslations } from "next-intl";

const ProjectWorkspace = () => {
    const { visiblePanels, rightSidebarOpen, isEndlessScroll, setIsEndlessScroll, showComments, setShowComments } = useViewContext();
    const t = useTranslations("navbar");

    const hasScreenplay = visiblePanels.includes("screenplay");

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

            {/* Left sidebar - only show when screenplay is visible */}
            {hasScreenplay && <EditorSidebarNavigation />}

            {/* Panel container */}
            <div className={styles.panel_area}>
                <SplitPanelContainer
                    suggestions={suggestions}
                    updateSuggestions={updateSuggestions}
                    suggestionData={suggestionData}
                    updateSuggestionData={updateSuggestionData}
                />
            </div>

            {/* Floating actions - visible when screenplay is active */}
            {hasScreenplay && (
                <div className={`${styles.floating_actions} ${rightSidebarOpen ? styles.floating_actions_shifted : ""}`}>
                    <div
                        className={`${navBtn.button} ${isEndlessScroll ? navBtn.active : ""}`}
                        onClick={() => setIsEndlessScroll(!isEndlessScroll)}
                        title={t("endlessScroll")}
                        style={{ width: "40px", height: "40px" }}
                    >
                        <Scroll size={18} />
                    </div>
                    <div
                        className={`${navBtn.button} ${!showComments ? navBtn.active : ""}`}
                        onClick={() => setShowComments(!showComments)}
                        title={t("toggleComments")}
                        style={{ width: "40px", height: "40px" }}
                    >
                        {showComments ? <MessageSquare size={18} /> : <MessageSquareOff size={18} />}
                    </div>
                </div>
            )}

            {/* Right sidebar - only show when screenplay is visible */}
            {hasScreenplay && <EditorSidebarFormat />}
        </div>
    );
};

export default ProjectWorkspace;
