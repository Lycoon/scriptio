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
import navBtn from "@components/utils/NavbarIconButton.module.css";

import { Eye, EyeClosed, MessageSquare, MessageSquareOff, Scroll } from "lucide-react";
import { useTranslations } from "next-intl";

const ProjectWorkspace = () => {
    const { isZenMode, updateIsZenMode } = useContext(UserContext);
    const { visiblePanels, isEndlessScroll, setIsEndlessScroll, showComments, setShowComments } = useViewContext();
    const t = useTranslations("navbar");

    const hasScreenplay = visiblePanels.includes("screenplay");

    const [suggestions, updateSuggestions] = useState<string[]>([]);
    const [suggestionData, updateSuggestionData] = useState<SuggestionData>({
        position: { x: 0, y: 0 },
        cursor: 0,
        cursorInNode: 0,
    });

    const toggleZenMode = () => updateIsZenMode((prev) => !prev);

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

            {/* Floating actions - visible when screenplay is active, shifts with right sidebar */}
            {hasScreenplay && (
                <div className={`${styles.floating_actions} ${!isZenMode ? styles.floating_actions_shifted : ""}`}>
                    <div
                        className={navBtn.button}
                        onClick={toggleZenMode}
                        style={{ width: "40px", height: "40px" }}
                    >
                        {isZenMode ? <EyeClosed size={18} /> : <Eye size={18} />}
                    </div>
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
