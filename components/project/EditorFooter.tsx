"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/react";
import { FileText, Maximize, MessageSquare, MessageSquareOff, Minimize, Scroll } from "lucide-react";

import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { useViewContext } from "@src/context/ViewContext";
import { paginationKey } from "@src/lib/screenplay/extensions/pagination-extension";
import { join } from "@src/lib/utils/misc";
import WritingTimer from "./WritingTimer";

import styles from "./EditorFooter.module.css";

/**
 * Track the screenplay's page count by reading the pagination plugin state.
 * Page count = number of page breaks + 1. Recomputed on every transaction
 * (cheap field read), but state only changes when the count actually does, so
 * the footer re-renders rarely.
 */
const useScreenplayPageCount = (editor: Editor | null): number | null => {
    const [count, setCount] = useState<number | null>(null);

    useEffect(() => {
        // No editor yet: `count` starts null, and the footer unmounts alongside
        // the editor, so no explicit reset is needed here.
        if (!editor || editor.isDestroyed) return;
        const read = () => {
            const state = paginationKey.getState(editor.state) as { breaks?: unknown[] } | undefined;
            const next = state?.breaks ? state.breaks.length + 1 : null;
            setCount((prev) => (prev === next ? prev : next));
        };
        read();
        editor.on("transaction", read);
        return () => {
            editor.off("transaction", read);
        };
    }, [editor]);

    return count;
};

/**
 * Subtle status bar at the bottom of the panel area: the screenplay page count
 * plus icon toggles for the view modes (endless scroll, comments, focus mode).
 */
const EditorFooter = () => {
    const t = useTranslations("navbar");
    const { editor } = useContext(ProjectContext);
    const { isZenMode, updateIsZenMode } = useContext(UserContext);
    const {
        isEndlessScroll,
        setIsEndlessScroll,
        showComments,
        setShowComments,
        setLeftSidebarOpen,
        setRightSidebarOpen,
    } = useViewContext();

    const pageCount = useScreenplayPageCount(editor);

    // Sidebar open-state captured on entering focus mode so it can be restored on exit.
    const sidebarsBeforeFocus = useRef<{ left: boolean; right: boolean } | null>(null);

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

    // Keep zen state in sync when the user leaves fullscreen via Escape.
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
        <div className={styles.bubble_right}>
            {pageCount !== null && (
                <>
                    <span className={styles.pages}>
                        <FileText size={13} />
                        {t("pageCount", { count: pageCount })}
                    </span>
                    <span className={styles.divider} />
                </>
            )}

            <WritingTimer triggerClassName={styles.action} triggerActiveClassName={styles.action_active} />

            <button
                type="button"
                className={join(styles.action, isEndlessScroll ? styles.action_active : "")}
                onClick={() => setIsEndlessScroll((prev) => !prev)}
                title={t("endlessScroll")}
                aria-label={t("endlessScroll")}
            >
                <Scroll size={14} />
            </button>
            <button
                type="button"
                className={join(styles.action, !showComments ? styles.action_active : "")}
                onClick={() => setShowComments((prev) => !prev)}
                title={t("toggleComments")}
                aria-label={t("toggleComments")}
            >
                {showComments ? <MessageSquare size={14} /> : <MessageSquareOff size={14} />}
            </button>
            <button
                type="button"
                className={join(styles.action, isZenMode ? styles.action_active : "")}
                onClick={isZenMode ? exitFocusMode : enterFocusMode}
                title={t("focusMode")}
                aria-label={t("focusMode")}
            >
                {isZenMode ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
        </div>
    );
};

export default EditorFooter;
