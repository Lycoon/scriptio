"use client";

import { useCallback, useContext, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Maximize, Mic, Minimize, Scroll, SpellCheck } from "lucide-react";

import { UserContext } from "@src/context/UserContext";
import { useViewContext } from "@src/context/ViewContext";
import { useSpellcheck } from "@src/context/SpellcheckContext";
import { join } from "@src/lib/utils/misc";
import { useIsPhone, useIsTouch } from "@src/lib/utils/hooks";
import { useActiveEditor } from "@src/lib/editor/use-active-editor";
import { getDictationLanguage, useDictation } from "@src/lib/editor/use-dictation";
import WritingTimer from "./WritingTimer";

import styles from "./EditorFooter.module.css";

/**
 * The view-mode toggles themselves — writing timer, dictation, endless scroll,
 * spellcheck, focus mode — without the surface they sit on.
 *
 * Split out from [EditorFooter] because a tablet shows them somewhere else
 * entirely: the always-open bottom-right bubble reads as clutter next to the
 * keyboard toolbar, so there they live behind that toolbar's burger instead (see
 * [MobileFormatToolbar]). Both surfaces render this, never at the same time —
 * which matters beyond deduplication, since two mounted copies would mean two
 * live dictation sessions writing into the same editor.
 */
const EditorFooterActions = () => {
    const t = useTranslations("navbar");
    const { isZenMode, updateIsZenMode } = useContext(UserContext);
    const { isEndlessScroll, setIsEndlessScroll, setLeftSidebarOpen, setRightSidebarOpen } = useViewContext();
    const { spellcheckLang, setSpellcheckLang } = useSpellcheck();
    const isPhone = useIsPhone();
    const isTouch = useIsTouch();
    const activeEditor = useActiveEditor();

    // Voice dictation into the active editor. The language is a device
    // preference set in Language settings; read it fresh at start so a change
    // there takes effect without remounting. Hidden where the browser lacks the
    // Web Speech API (e.g. Firefox) — and on phone, where the footer disappears
    // behind the on-screen keyboard: the mic lives in the navbar's edit-mode
    // cluster there instead ([ProjectNavbarMobile]). Keep it to one surface per
    // platform — two live sessions would both write into the same editor.
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

    return (
        <>
            <WritingTimer triggerClassName={styles.action} triggerActiveClassName={styles.action_active} />

            {dictation.isSupported && activeEditor && !isPhone && (
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
            {/* Focus mode is the Fullscreen API plus hiding the desktop sidebar
                chrome, and neither means anything on a touch device: iOS has no
                fullscreen to enter, and the sidebars are already overlays. Gated
                on the pointer rather than the width so tablets are covered too —
                they take the desktop layout and would otherwise keep a button
                that does nothing. */}
            {!isTouch && (
                <button
                    type="button"
                    className={join(styles.action, isZenMode ? styles.action_active : "")}
                    onClick={isZenMode ? exitFocusMode : enterFocusMode}
                    title={t("focusMode")}
                    aria-label={t("focusMode")}
                >
                    {isZenMode ? <Minimize size={18} /> : <Maximize size={18} />}
                </button>
            )}
        </>
    );
};

export default EditorFooterActions;
