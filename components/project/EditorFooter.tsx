"use client";

import { useCallback, useContext, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Maximize, Mic, Minimize, Scroll, SpellCheck } from "lucide-react";

import { UserContext } from "@src/context/UserContext";
import { useViewContext } from "@src/context/ViewContext";
import { useSpellcheck } from "@src/context/SpellcheckContext";
import { join } from "@src/lib/utils/misc";
import { useIsPhone } from "@src/lib/utils/hooks";
import { useActiveEditor } from "@src/lib/editor/use-active-editor";
import { getDictationLanguage, useDictation } from "@src/lib/editor/use-dictation";
import WritingTimer from "./WritingTimer";

import styles from "./EditorFooter.module.css";

/**
 * Subtle status bar at the bottom of the panel area: icon toggles for the view
 * modes (endless scroll, comments, focus mode).
 */
const EditorFooter = () => {
    const t = useTranslations("navbar");
    const { isZenMode, updateIsZenMode } = useContext(UserContext);
    const { isEndlessScroll, setIsEndlessScroll, setLeftSidebarOpen, setRightSidebarOpen } = useViewContext();
    const { spellcheckLang, setSpellcheckLang } = useSpellcheck();
    const isPhone = useIsPhone();
    // The footer's toggles all act on the active text editor. Board/statistics
    // panels have none, so on phone (single-panel) the footer is hidden there.
    const activeEditor = useActiveEditor();

    // Voice dictation into the active editor. The language is a device
    // preference set in Language settings; read it fresh at start so a change
    // there takes effect without remounting. Hidden where the browser lacks the
    // Web Speech API (e.g. Firefox).
    const dictation = useDictation(activeEditor, null);
    const toggleDictation = useCallback(() => {
        if (dictation.isListening) dictation.stop();
        else dictation.start(getDictationLanguage());
    }, [dictation]);
    // Switching to a panel with no editor (desktop board/statistics) leaves
    // nothing to dictate into — stop the mic so it isn't left listening.
    useEffect(() => {
        if (!activeEditor && dictation.isListening) dictation.stop();
    }, [activeEditor, dictation.isListening, dictation.stop]);

    // Remember the last active language so the toggle can restore it after being turned
    // off; default to English when nothing has been selected yet.
    const lastSpellcheckLang = useRef("en");
    useEffect(() => {
        if (spellcheckLang) lastSpellcheckLang.current = spellcheckLang;
    }, [spellcheckLang]);

    const toggleSpellcheck = useCallback(() => {
        setSpellcheckLang(spellcheckLang ? null : lastSpellcheckLang.current);
    }, [spellcheckLang, setSpellcheckLang]);

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

    // On phone the workspace is single-panel: hide the footer when the shown
    // panel has no text editor (board, statistics) — its controls don't apply.
    if (isPhone && !activeEditor) return null;

    return (
        <div className={styles.bubble_right}>
            <WritingTimer triggerClassName={styles.action} triggerActiveClassName={styles.action_active} />

            {dictation.isSupported && activeEditor && (
                <button
                    type="button"
                    className={join(styles.action, dictation.isListening ? styles.recording : "")}
                    onClick={toggleDictation}
                    title={t("dictate")}
                    aria-label={t("dictate")}
                    aria-pressed={dictation.isListening}
                >
                    <Mic size={18} />
                </button>
            )}

            <button
                type="button"
                className={join(styles.action, isEndlessScroll ? styles.action_active : "")}
                onClick={() => setIsEndlessScroll((prev) => !prev)}
                title={t("endlessScroll")}
                aria-label={t("endlessScroll")}
            >
                <Scroll size={18} />
            </button>
            <button
                type="button"
                className={join(styles.action, spellcheckLang ? styles.action_active : "")}
                onClick={toggleSpellcheck}
                title={t("toggleSpellcheck")}
                aria-label={t("toggleSpellcheck")}
            >
                <SpellCheck size={18} />
            </button>
            {/* Focus mode relies on the Fullscreen API and hiding desktop sidebar
                chrome — neither meaningful on phone — so it's hidden there (CSS). */}
            <button
                type="button"
                className={join(styles.action, styles.focus_action, isZenMode ? styles.action_active : "")}
                onClick={isZenMode ? exitFocusMode : enterFocusMode}
                title={t("focusMode")}
                aria-label={t("focusMode")}
            >
                {isZenMode ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
        </div>
    );
};

export default EditorFooter;
