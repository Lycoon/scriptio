"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
    ArrowLeft,
    AudioLines,
    BarChart2,
    Check,
    CloudUpload,
    History,
    Info,
    LogIn,
    LogOut,
    Lock,
    Menu,
    Mic,
    Monitor,
    Redo2,
    Undo2,
} from "lucide-react";

import { useViewContext } from "@src/context/ViewContext";
import { useActiveEditor } from "@src/lib/editor/use-active-editor";
import { getDictationLanguage, useDictation } from "@src/lib/editor/use-dictation";
import { uploadToCloudPopup } from "@src/lib/screenplay/popup";
import { join } from "@src/lib/utils/misc";

import { useProjectNavbar } from "./useProjectNavbar";
import { StatusIndicator } from "./ProjectNavbarShared";
import ProjectNavbarMobileMenu from "./ProjectNavbarMobileMenu";
import SavesPanel from "./SavesPanel";
import ProductionPanel from "./ProductionPanel";
import ReadAloudPanel from "./ReadAloudPanel";
import ScreenplaySearch from "./ScreenplaySearch";
import AnalyticsModal from "@components/analytics/AnalyticsModal";

import navbar from "./ProjectNavbar.module.css";
import mobileMenu from "./ProjectNavbarMobileMenu.module.css";
import navBtn from "@components/utils/NavbarIconButton.module.css";

// Stable no-op subscribe for the mount gate below: the client/server snapshot is
// fixed after hydration, so there is no external store to subscribe to.
const emptySubscribe = () => () => {};

/**
 * Phone project navbar: a slim two-cluster bar (edit-mode controls + search/burger)
 * whose burger opens the full menu that the desktop spreads across the bar and the
 * dashboard sidebar. Shared project state (title, sign-out, dashboard menu) comes
 * from {@link useProjectNavbar}; the desktop layout lives in [ProjectNavbar].
 */
const ProjectNavbarMobile = () => {
    const t = useTranslations("navbar");
    const tModal = useTranslations("modal");
    const tSidebar = useTranslations("sidebar");

    const {
        openDashboard,
        closeDashboard,
        isDashboardOpen,
        mobileMenuOpen,
        setMobileMenuOpen,
        membership,
        userCtx,
        canUploadToCloud,
        dashboardMenu,
        isSignedIn,
        projectId,
        isInProject,
        isPro,
        projectTitle,
        onTitleChange,
        onTitleBlur,
        backToProjects,
        onSignOut,
    } = useProjectNavbar();

    const { setLeftSidebarOpen, setRightSidebarOpen, chromeHidden, mobileEditMode, setMobileEditMode } =
        useViewContext();
    const activeEditor = useActiveEditor();

    // Production, read-aloud and search all act on screenplay text, so they only
    // belong on a panel that has a text editor behind it — not on a board canvas
    // or the statistics view. Phone is single-panel, so the active editor being
    // null is exactly "the open view has no text" (same test as the pen FAB in
    // [ProjectWorkspace]). Saves and analytics stay: both are project-wide.
    const isEditorView = !!activeEditor;

    // The screenplay tools (saves/production/read-aloud) open one at a time as a
    // sheet below the bar; analytics is a full modal. Kept as a single value so
    // tapping one tool icon replaces whatever sheet was open.
    const [activePanel, setActivePanel] = useState<null | "saves" | "production" | "readAloud">(null);
    const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);

    // The tool sheets are portaled to <body> (see below) — gate on mount so the
    // server and first client render agree, as `document` is client-only. Uses
    // useSyncExternalStore (server snapshot false, client true) rather than a
    // setState-in-effect, so flipping to mounted doesn't trigger a cascading render.
    const mounted = useSyncExternalStore(
        emptySubscribe,
        () => true,
        () => false,
    );

    // Opening a tool sheet closes the side drawers and the burger menu so it
    // surfaces cleanly on top; tapping the same icon again dismisses it. Reads
    // the render-time value (not a functional updater) so a re-tap resolves to
    // null even though the panel's own outside-click already fired on mousedown —
    // mirrors the desktop bar's toggles.
    const toggleTool = (panel: "saves" | "production" | "readAloud") => {
        const next = activePanel === panel ? null : panel;
        if (next) {
            setLeftSidebarOpen(false);
            setRightSidebarOpen(false);
            setMobileMenuOpen(false);
        }
        setActivePanel(next);
    };

    const openAnalytics = () => {
        setActivePanel(null);
        setLeftSidebarOpen(false);
        setRightSidebarOpen(false);
        setMobileMenuOpen(false);
        setIsAnalyticsOpen(true);
    };

    // Opening a board while one of the text-only sheets is up would leave it
    // stranded — its trigger has just left the bar, so re-tapping to dismiss is no
    // longer possible. Close it with the buttons.
    useEffect(() => {
        if (!isEditorView && (activePanel === "production" || activePanel === "readAloud")) {
            setActivePanel(null);
        }
    }, [isEditorView, activePanel]);

    // Undo/redo are backed by the collaboration UndoManager. Guard on the command
    // existing so calling before Yjs is ready can't throw.
    const runHistory = (action: "undo" | "redo") => {
        if (activeEditor && typeof activeEditor.commands[action] === "function") {
            activeEditor.chain().focus()[action]().run();
        }
    };

    // Voice dictation into the editor being written in. On phone the mic lives
    // HERE rather than in the editor footer, which sits behind the on-screen
    // keyboard and so is out of reach exactly when one dictates; the footer's mic
    // is desktop-only ([EditorFooter]). That split also keeps a single recogniser
    // in play — two live `useDictation` sessions would fight over the transcript.
    // The language is a device preference set in Language settings; read it fresh
    // at start so a change there takes effect without remounting.
    const dictation = useDictation(activeEditor, null);
    const toggleDictation = () => {
        if (dictation.isListening) dictation.stop();
        else dictation.start(getDictationLanguage());
    };

    // The mic button only renders while editing, so stop listening whenever that
    // ends (the ✓ below, but also the panel's own exits) — otherwise the mic would
    // stay open with nothing on screen left to turn it off.
    useEffect(() => {
        if (dictation.isListening && (!mobileEditMode || !activeEditor)) dictation.stop();
    }, [mobileEditMode, activeEditor, dictation.isListening, dictation.stop]);

    // Leave edit mode: blur so the keyboard dismisses immediately (the panel's
    // setEditable(false) also does this, but blur here makes it instant).
    const exitEditMode = () => {
        activeEditor?.commands.blur();
        setMobileEditMode(false);
    };

    return (
        <nav className={join(navbar.container, chromeHidden ? navbar.container_hidden : "")}>
            <nav className={navbar.mobile_bar}>
                {/* Left cluster: edit-mode controls (leave edit mode + undo/redo)
                    while editing; otherwise the back-to-projects arrow. */}
                {isInProject &&
                    projectId &&
                    (mobileEditMode ? (
                        <div className={navbar.mobile_left}>
                            <div className={`${navBtn.button} ${navbar.mobile_icon}`} onClick={exitEditMode}>
                                <Check size={18} />
                            </div>
                            <div className={`${navBtn.button} ${navbar.mobile_icon}`} onClick={() => runHistory("undo")}>
                                <Undo2 size={18} />
                            </div>
                            <div className={`${navBtn.button} ${navbar.mobile_icon}`} onClick={() => runHistory("redo")}>
                                <Redo2 size={18} />
                            </div>
                        </div>
                    ) : (
                        <div className={navbar.mobile_left}>
                            <div
                                className={`${navBtn.button} ${navbar.mobile_icon}`}
                                onClick={backToProjects}
                                aria-label={t("back")}
                            >
                                <ArrowLeft size={18} />
                            </div>
                        </div>
                    ))}
                {/* Dictation, in the slot the tools cluster occupies in reader mode:
                    its own pill so it reads as a mode toggle rather than another
                    history control. Hidden where the browser lacks the Web Speech
                    API (e.g. Firefox). */}
                {isInProject && projectId && mobileEditMode && dictation.isSupported && activeEditor && (
                    <div className={navbar.mobile_tools}>
                        <div
                            className={join(
                                navBtn.button,
                                navbar.mobile_icon,
                                dictation.isListening ? navbar.recording : "",
                            )}
                            // Swallow the compat mousedown so the tap can't blur the
                            // contenteditable: that would drop the keyboard (and the
                            // format bar with it) the moment dictation starts. Same
                            // guard the keyboard toolbar uses — see MobileFormatToolbar.
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={toggleDictation}
                            aria-label={t("dictate")}
                            aria-pressed={dictation.isListening}
                        >
                            <Mic size={18} />
                        </div>
                    </div>
                )}
                {/* Screenplay tools cluster: the saves/production/read-aloud/analytics
                    entries that the desktop bar spreads across its left/right. Each opens
                    a sheet (or the analytics modal) that fits the phone screen. Hidden
                    while editing — the left cluster expands to the edit controls then, so
                    the bar has no room, and these are review-time tools anyway. The
                    text-only two thin out further on a board canvas (see isEditorView). */}
                {isInProject && projectId && !mobileEditMode && (
                    <div className={navbar.mobile_tools}>
                        <div
                            className={`${navBtn.button} ${navbar.mobile_icon} ${activePanel === "saves" ? navBtn.active : ""}`}
                            onClick={() => toggleTool("saves")}
                            aria-label={t("history")}
                        >
                            <History size={18} />
                        </div>
                        {isEditorView && (
                            <>
                                <div
                                    className={`${navBtn.button} ${navbar.mobile_icon} ${activePanel === "production" ? navBtn.active : ""}`}
                                    onClick={() => toggleTool("production")}
                                    aria-label={t("production")}
                                >
                                    <Lock size={18} />
                                </div>
                                <div
                                    className={`${navBtn.button} ${navbar.mobile_icon} ${activePanel === "readAloud" ? navBtn.active : ""}`}
                                    onClick={() => toggleTool("readAloud")}
                                    aria-label={t("readAloud")}
                                >
                                    <AudioLines size={18} />
                                </div>
                            </>
                        )}
                        <div
                            className={`${navBtn.button} ${navbar.mobile_icon} ${isAnalyticsOpen ? navBtn.active : ""}`}
                            onClick={openAnalytics}
                            aria-label={t("analytics")}
                        >
                            <BarChart2 size={18} />
                        </div>
                    </div>
                )}
                {/* The element-type selector lives in the format bar above the
                    keyboard (MobileFormatToolbar); the sidebars open via the editor
                    edge chevrons; everything else is in the burger menu below. */}
                <div className={navbar.mobile_right}>
                    {isInProject && isEditorView && <ScreenplaySearch />}
                    <div
                        className={`${navBtn.button} ${navbar.mobile_icon} ${mobileMenuOpen || isDashboardOpen ? navBtn.active : ""}`}
                        onClick={() => {
                            // The dashboard drawer sits below the navbar on phone, so the
                            // burger stays tappable while it's up — and it was reached
                            // *through* this menu. Tapping again dismisses that stack
                            // rather than stacking another menu behind it.
                            if (isDashboardOpen) {
                                closeDashboard();
                                setMobileMenuOpen(false);
                                return;
                            }
                            const next = !mobileMenuOpen;
                            // The menu drawer opens on the right, same as the format
                            // sidebar; close both side drawers so it opens cleanly on top.
                            if (next) {
                                setLeftSidebarOpen(false);
                                setRightSidebarOpen(false);
                            }
                            setMobileMenuOpen(next);
                        }}
                    >
                        <Menu size={18} />
                    </div>
                </div>
            </nav>

            {isInProject && projectId && (
                <ProjectNavbarMobileMenu isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)}>
                    <div className={mobileMenu.title_row}>
                        {membership ? (
                            <StatusIndicator />
                        ) : (
                            <Monitor className={navbar.status_icon} style={{ color: "var(--secondary-text)" }} />
                        )}
                        <input
                            type="text"
                            className={mobileMenu.title_input}
                            onChange={(e) => onTitleChange(e.target.value)}
                            onBlur={onTitleBlur}
                            value={projectTitle}
                        />
                    </div>

                    {canUploadToCloud && (
                        <button
                            className={mobileMenu.item}
                            onClick={() => {
                                uploadToCloudPopup(projectId, userCtx);
                                setMobileMenuOpen(false);
                            }}
                        >
                            <CloudUpload size={18} />
                            <span>{t("uploadToCloud")}</span>
                        </button>
                    )}

                    <div className={mobileMenu.separator} />

                    {/* Dashboard settings — the modal drops its sidebar on phone, so
                        its grouped tabs are navigated from here; each opens the
                        dashboard directly on that tab. */}
                    {dashboardMenu.map((section) => (
                        <div key={section.group} className={mobileMenu.section}>
                            <div className={mobileMenu.group_label}>{section.group}</div>
                            {section.items.map((tab) => (
                                <button
                                    key={tab.id}
                                    className={mobileMenu.item}
                                    onClick={() => {
                                        openDashboard(tab.id, { fromMenu: true });
                                        setMobileMenuOpen(false);
                                    }}
                                >
                                    {tab.icon}
                                    <span>{tab.label}</span>
                                </button>
                            ))}
                        </div>
                    ))}

                    {/* Set the sign in/out + About actions apart from the dashboard
                        tab groups above, so they don't read as part of Preferences
                        (mirrors the DashboardModal sidebar's footer separation). */}
                    <div className={mobileMenu.separator} />

                    {isSignedIn ? (
                        <button
                            className={mobileMenu.item}
                            onClick={() => {
                                setMobileMenuOpen(false);
                                onSignOut();
                            }}
                        >
                            <LogOut size={18} />
                            <span>{tSidebar("logOut")}</span>
                        </button>
                    ) : (
                        <button
                            className={mobileMenu.item}
                            onClick={() => {
                                openDashboard("Auth", { fromMenu: true });
                                setMobileMenuOpen(false);
                            }}
                        >
                            <LogIn size={18} />
                            <span>{tSidebar("auth")}</span>
                        </button>
                    )}

                    <button
                        className={mobileMenu.item}
                        onClick={() => {
                            openDashboard("About", { fromMenu: true });
                            setMobileMenuOpen(false);
                        }}
                    >
                        <Info size={18} />
                        <span>{tModal("tabs.About")}</span>
                    </button>
                </ProjectNavbarMobileMenu>
            )}

            {/* Tool sheets are portaled to <body> so their fixed positioning escapes
                the navbar's transform + stacking context (which slides with the reader
                scroll); on phone each panel's CSS renders it as a full-width sheet
                pinned below the bar. */}
            {mounted &&
                isInProject &&
                projectId &&
                createPortal(
                    <>
                        <SavesPanel
                            projectId={projectId}
                            isOpen={activePanel === "saves"}
                            onClose={() => setActivePanel(null)}
                            isPro={isPro}
                        />
                        <ProductionPanel
                            isOpen={activePanel === "production"}
                            onClose={() => setActivePanel(null)}
                        />
                        <ReadAloudPanel
                            isOpen={activePanel === "readAloud"}
                            onClose={() => setActivePanel(null)}
                        />
                    </>,
                    document.body,
                )}

            <AnalyticsModal isOpen={isAnalyticsOpen} onClose={() => setIsAnalyticsOpen(false)} />
        </nav>
    );
};

export default ProjectNavbarMobile;
