"use client";

import { useContext, useEffect, useState } from "react";
import { useViewContext } from "@src/context/ViewContext";
import { ProjectContext } from "@src/context/ProjectContext";
import { useActiveEditor } from "@src/lib/editor/use-active-editor";
import { centerCaretInView, focusEditorInViewport } from "@src/lib/editor/focus-in-viewport";
import { useIsPhone } from "@src/lib/utils/hooks";
import EditorSidebarNavigation from "@components/editor/sidebar/EditorSidebarNavigation";
import EditorSidebarFormat from "@components/editor/sidebar/EditorSidebarFormat";
import ContextMenu from "@components/editor/sidebar/ContextMenu";
import SuggestionMenu, { SuggestionData } from "@components/editor/SuggestionMenu";
import { Popup } from "@components/popup/Popup";
import SplitPanelContainer from "./SplitPanelContainer";
import EditorFooter from "./EditorFooter";
import TimelinePanel from "@components/editor/timeline/TimelinePanel";
import EditorBottomBar from "@components/editor/EditorBottomBar";
import styles from "./ProjectWorkspace.module.css";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";

/**
 * Ceiling on how often the shell's anchoring guard may snap the document back
 * to the top before it assumes it is fighting something and stands down. A
 * genuine caret chase resets a handful of times; a fight resets every frame.
 */
const MAX_ANCHOR_RESETS_PER_SECOND = 12;

const ProjectWorkspace = () => {
    const {
        leftSidebarOpen,
        setLeftSidebarOpen,
        rightSidebarOpen,
        setRightSidebarOpen,
        timelineOpen,
        mobileEditMode,
        setMobileEditMode,
    } = useViewContext();
    const { isReadOnly } = useContext(ProjectContext);
    const isPhone = useIsPhone();
    const activeEditor = useActiveEditor();

    // iOS WKWebView anchoring guard. The app shell is pinned to the viewport
    // (100vh, overflow hidden) and only the inner editor container is meant to
    // scroll. But with the on-screen keyboard up, a contenteditable edit — most
    // reproducibly deleting/joining an empty node — can make WebKit scroll the
    // *document itself* to chase the caret. That drags the whole shell up: the
    // (relatively positioned) navbar slides off the top and the editor looks
    // unanchored. Nothing at the window level is ever supposed to scroll here, so
    // snap it straight back to the top. The listener is on window and
    // non-capturing, so it never fires for the inner container's own scroll.
    //
    // Coalesced to one reset per frame, with a breaker: resetting straight from
    // the scroll handler re-enters (the reset is itself a scroll), and anything
    // that keeps re-scrolling the document — a smooth scroll animation aimed at
    // a target it can never reach, say — turns that into an unbounded fight that
    // pins the main thread. Past a plausible rate the guard stands down for a
    // beat: a drifted shell is a cosmetic problem, a locked-up app is not.
    useEffect(() => {
        if (!isPhone) return;

        let frame: number | null = null;
        let resets = 0;
        let windowStart = 0;
        let mutedUntil = 0;

        const anchor = () => {
            if (frame !== null) return;
            frame = requestAnimationFrame(() => {
                frame = null;
                const now = performance.now();
                if (now < mutedUntil) return;
                if (window.scrollY === 0 && window.scrollX === 0) return;

                if (now - windowStart > 1000) {
                    windowStart = now;
                    resets = 0;
                }
                if (++resets > MAX_ANCHOR_RESETS_PER_SECOND) {
                    mutedUntil = now + 1000;
                    return;
                }
                window.scrollTo(0, 0);
            });
        };

        window.addEventListener("scroll", anchor, { passive: true });
        return () => {
            if (frame !== null) cancelAnimationFrame(frame);
            window.removeEventListener("scroll", anchor);
        };
    }, [isPhone]);

    // Enter edit mode and drop the caret into the reader's current editor so the
    // keyboard comes up straight away. Focus must happen SYNCHRONOUSLY inside this
    // tap gesture — iOS only raises the keyboard when focus() runs in the same
    // user-gesture turn, so we flip setEditable(true) and focus right here rather
    // than deferring to the mobileEditMode effect (which runs after this render).
    const enterEditMode = () => {
        setMobileEditMode(true);
        const editor = activeEditor;
        if (editor) {
            editor.setEditable(true);
            // Drop the caret on a character that's currently on screen rather than
            // at the old selection, so the view doesn't jump when the keyboard rises.
            focusEditorInViewport(editor);
            // Then bring that caret to the middle of what stays visible once the
            // keyboard is up, so the user can see where the focus landed.
            centerCaretInView(editor);
        }
    };

    // The pen shows on phone in reader mode, only when there's an editable text
    // editor to enter (not for viewers, not on board/statistics panels).
    const showEditFab = isPhone && !mobileEditMode && !isReadOnly && !!activeEditor;

    // On phone the sidebars slide over the editor as drawers; a backdrop dims the
    // editor and gives a tap-anywhere-to-close target.
    const drawersOpen = leftSidebarOpen || rightSidebarOpen;
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

            {/* Center column: the Timeline strip sits above the split panels only,
                so it never overlaps the left/right sidebars. */}
            <div className={styles.center_column}>
                {timelineOpen && <TimelinePanel />}

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
                        className={`${styles.right_sidebar_toggle} ${timelineOpen ? styles.timeline_open : ""}`}
                        onClick={() => setRightSidebarOpen((prev) => !prev)}
                    >
                        {rightSidebarOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                    </div>

                    {/* Phone drawer backdrop.
                        Kept MOUNTED and faded, never conditionally rendered: on
                        iOS, when the element under a tap stops being rendered by
                        its own click handler, WebKit re-resolves its remembered
                        pointer position onto whatever now sits beneath the point
                        — the board — and then re-runs that hit-test + hover chain
                        on every subsequent layout/style change. Cards sweeping
                        under the phantom point toggled `.card:hover`'s
                        transitioned box-shadow frame after frame, freezing drags
                        and pinches at ~8fps until a tap elsewhere moved the point
                        away. A surviving backdrop keeps the point pinned to an
                        element that still exists, and is inert while hidden.

                        Unmounting is not the only way to lose that: the
                        stylesheet must not hide it either — see
                        .sidebar_backdrop_hidden. */}
                    {isPhone && (
                        <div
                            className={`${styles.sidebar_backdrop} ${drawersOpen ? "" : styles.sidebar_backdrop_hidden}`}
                            onClick={drawersOpen ? closeSidebars : undefined}
                        />
                    )}

                    {/* Floating page-count + view-mode bubbles */}
                    <EditorFooter />
                </div>
            </div>

            {/* Right sidebar */}
            <EditorSidebarFormat />

            {/* Touch-only bottom chrome: undo/redo, the format pill, and the
                view-mode burger, riding the on-screen keyboard when there is one. */}
            <EditorBottomBar />

            {/* Phone-only pen button: enters edit mode from the reader. Hides with
                the rest of the chrome while scrolling down through the script. */}
            {showEditFab && (
                <button
                    type="button"
                    aria-label="Edit"
                    className={styles.edit_fab}
                    onClick={enterEditMode}
                >
                    <Pencil size={22} />
                </button>
            )}
        </div>
    );
};

export default ProjectWorkspace;
