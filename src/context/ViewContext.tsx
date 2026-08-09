"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";

/** Phone breakpoint — mirrors the `(max-width: 767px)` CSS blocks and useIsPhone. */
const isPhoneViewport = () =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

export type PanelType = "screenplay" | "board" | "statistics" | "title" | "draft" | "document";
export type SplitSide = "primary" | "secondary";

/** Panel kinds that display a specific document, and so carry a docId per side. */
export type DocumentPanelKind = "board" | "document";

/**
 * How a screenplay panel renders the script: as the editor itself, or as the
 * grid of scene index cards. The screenplay is a singleton panel, so one value
 * covers whichever side is showing it.
 */
export type ScreenplayViewMode = "editor" | "cards";

/** Bounds for the index-card grid's columns-per-row (its zoom control). */
export const SCENE_CARD_COLUMNS_MIN = 1;
export const SCENE_CARD_COLUMNS_MAX = 5;
export const SCENE_CARD_COLUMNS_DEFAULT = 3;

interface ViewContextType {
    primaryPanel: PanelType;
    secondaryPanel: PanelType | null;
    /** Document shown on each side when its panel is a board/editor document. */
    primaryDocId: string | null;
    secondaryDocId: string | null;
    splitRatio: number;
    isSplit: boolean;
    visiblePanels: PanelType[];
    mountedPanels: Set<PanelType>;
    focusedSide: SplitSide;
    focusedPanel: PanelType;
    isEndlessScroll: boolean;
    /** How the screenplay panel renders — the editor, or the index-card grid. */
    screenplayView: ScreenplayViewMode;
    setScreenplayView: (mode: ScreenplayViewMode) => void;
    /**
     * Index cards per row, which is what the card view's zoom control actually
     * changes — fewer columns means wider cards. Lives here rather than in the
     * panel so it survives switching back to the script and returning.
     */
    sceneCardColumns: number;
    setSceneCardColumns: (value: number | ((prev: number) => number)) => void;
    showComments: boolean;
    leftSidebarOpen: boolean;
    rightSidebarOpen: boolean;
    /** Whether the horizontal Timeline strip is open beneath the project navbar. */
    timelineOpen: boolean;
    setTimelineOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
    /**
     * Phone-only, coarse "chrome is mostly hidden" flag (used e.g. to drop the
     * navbar's hit-testing once it's collapsed). The *visual* hide is continuous:
     * DocumentEditorPanel's scroll handler writes a 0→1 `--chrome-hide` CSS
     * variable that the navbar + edge handles + pen button track linearly, so the
     * chrome follows the scroll gesture instead of flipping between two states.
     * Once that gesture is released the remaining travel is animated out — to 1
     * if it got past halfway, back to 0 if not — so the chrome only ever comes to
     * rest fully shown or fully hidden. This boolean flips at that same halfway
     * point; both reset when the user types or the editor enters edit mode.
     */
    chromeHidden: boolean;
    setChromeHidden: (value: boolean | ((prev: boolean) => boolean)) => void;
    /**
     * Phone-only: the editor opens in a keyboard-free "reader" mode by default.
     * Tapping the floating pen button flips this on, which makes the editors
     * editable and brings up the keyboard; the navbar checkmark flips it back.
     * Ignored on desktop, where editors are always editable (subject to role).
     */
    mobileEditMode: boolean;
    setMobileEditMode: (value: boolean | ((prev: boolean) => boolean)) => void;
    setPrimaryPanel: (panel: PanelType) => void;
    setSecondaryPanel: (panel: PanelType | null) => void;
    setSplitRatio: (ratio: number) => void;
    setFocusedSide: (side: SplitSide) => void;
    setFocusedPanel: (panel: PanelType) => void;
    setSidePanel: (side: SplitSide, panel: PanelType) => void;
    /** Open a specific document (board/editor) on a given side and focus it. */
    setSideDocument: (side: SplitSide, docId: string, kind: DocumentPanelKind) => void;
    /**
     * Split the single panel and open a document on one side, keeping the
     * currently-shown panel on the other. `side` is where the new document
     * goes. Assumes the view is not already split.
     */
    splitWithDocument: (docId: string, kind: DocumentPanelKind, side: SplitSide) => void;
    /** Clear a document from any side currently showing it (e.g. after delete). */
    closeDocument: (docId: string) => void;
    swapPanels: () => void;
    setIsEndlessScroll: (value: boolean | ((prev: boolean) => boolean)) => void;
    /**
     * Subscribe to be called synchronously *just before* `isEndlessScroll`
     * flips — i.e. while the outgoing layout is still on screen and measurable.
     * Editor panels use it to record which block sits at the top of their
     * viewport, because the two modes render the same document at very
     * different heights and a raw scrollTop would land somewhere else entirely
     * (see DocumentEditorPanel's scroll anchoring). Returns an unsubscribe.
     */
    onBeforeEndlessScrollChange: (callback: () => void) => () => void;
    setShowComments: (value: boolean | ((prev: boolean) => boolean)) => void;
    setLeftSidebarOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
    setRightSidebarOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
}

const ViewContext = createContext<ViewContextType>(null!);

export const useViewContext = () => useContext(ViewContext);

export const ViewProvider = ({ children }: { children: ReactNode }) => {
    const [primaryPanel, setPrimaryPanelState] = useState<PanelType>("screenplay");
    const [secondaryPanel, setSecondaryPanelState] = useState<PanelType | null>(null);
    // Per-side document binding. Only meaningful when the side's panel is a
    // board/editor document; null for singleton views (screenplay, title, …).
    const [primaryDocId, setPrimaryDocId] = useState<string | null>(null);
    const [secondaryDocId, setSecondaryDocId] = useState<string | null>(null);
    const [splitRatio, setSplitRatio] = useState(0.5);
    const [mountedPanels, setMountedPanels] = useState<Set<PanelType>>(() => new Set(["screenplay", "title"]));
    const [focusedSide, setFocusedSideState] = useState<SplitSide>("primary");
    // Default to endless (continuous, reflowed) on phones: it renders text at a
    // readable size with no page rectangles to shift while writing. Desktop
    // defaults to the paged view. Users can toggle either way (EditorFooter).
    const [isEndlessScroll, setIsEndlessScrollState] = useState<boolean>(isPhoneViewport);
    const [screenplayView, setScreenplayView] = useState<ScreenplayViewMode>("editor");
    const [sceneCardColumns, setSceneCardColumns] = useState<number>(SCENE_CARD_COLUMNS_DEFAULT);
    const [showComments, setShowComments] = useState<boolean>(true);
    const [leftSidebarOpen, setLeftSidebarOpenState] = useState<boolean>(false);
    const [rightSidebarOpen, setRightSidebarOpenState] = useState<boolean>(false);
    const [timelineOpen, setTimelineOpen] = useState<boolean>(false);
    const [chromeHidden, setChromeHidden] = useState<boolean>(false);
    // Default to reader mode on phone (no keyboard until the user taps the pen).
    const [mobileEditMode, setMobileEditMode] = useState<boolean>(false);

    // Mirror the live open-state in refs so the wrapped setters can resolve a
    // functional update and enforce mutual exclusion without stale closures.
    const leftOpenRef = useRef(leftSidebarOpen);
    const rightOpenRef = useRef(rightSidebarOpen);
    useEffect(() => {
        leftOpenRef.current = leftSidebarOpen;
    }, [leftSidebarOpen]);
    useEffect(() => {
        rightOpenRef.current = rightSidebarOpen;
    }, [rightSidebarOpen]);

    // On phone the sidebars are overlay drawers that would overlap each other and
    // the editor, so only one may be open at a time — opening one closes the other.
    // On desktop they're inline columns and both can stay open.
    const setLeftSidebarOpen = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
        const next = typeof value === "function" ? value(leftOpenRef.current) : value;
        setLeftSidebarOpenState(next);
        if (next && isPhoneViewport()) setRightSidebarOpenState(false);
    }, []);
    const setRightSidebarOpen = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
        const next = typeof value === "function" ? value(rightOpenRef.current) : value;
        setRightSidebarOpenState(next);
        if (next && isPhoneViewport()) setLeftSidebarOpenState(false);
    }, []);

    // Endless-scroll listeners fired before the flip (see onBeforeEndlessScrollChange).
    // Same ref-mirroring trick as the sidebars: the setter resolves a functional
    // update itself so the listeners can run *outside* the state updater — React
    // may call an updater twice (StrictMode / re-render), and these callbacks
    // measure the DOM, so they must fire exactly once per real change.
    const beforeEndlessChangeRef = useRef(new Set<() => void>());
    const endlessScrollRef = useRef(isEndlessScroll);
    useEffect(() => {
        endlessScrollRef.current = isEndlessScroll;
    }, [isEndlessScroll]);

    const onBeforeEndlessScrollChange = useCallback((callback: () => void) => {
        const listeners = beforeEndlessChangeRef.current;
        listeners.add(callback);
        return () => {
            listeners.delete(callback);
        };
    }, []);

    const setIsEndlessScroll = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
        const next = typeof value === "function" ? value(endlessScrollRef.current) : value;
        if (next === endlessScrollRef.current) return;
        // Still the old layout at this point — the state update below is what
        // swaps it — so subscribers can measure where the reader is looking.
        for (const listener of beforeEndlessChangeRef.current) listener();
        endlessScrollRef.current = next;
        setIsEndlessScrollState(next);
    }, []);

    const isSplit = secondaryPanel !== null;

    const focusedPanel = useMemo<PanelType>(() => {
        if (!secondaryPanel || focusedSide === "primary") return primaryPanel;
        return secondaryPanel;
    }, [focusedSide, primaryPanel, secondaryPanel]);

    const visiblePanels = useMemo(() => {
        const panels: PanelType[] = [primaryPanel];
        if (secondaryPanel) panels.push(secondaryPanel);
        return panels;
    }, [primaryPanel, secondaryPanel]);

    // Mount a singleton panel so the keep-alive renderer keeps it in the DOM.
    // Document panels (board/document) are rendered per-side, so they don't need
    // a mount entry.
    const mount = useCallback((panel: PanelType) => {
        setMountedPanels((prev) => {
            if (prev.has(panel)) return prev;
            const next = new Set(prev);
            next.add(panel);
            return next;
        });
    }, []);

    const setPrimaryPanel = useCallback(
        (panel: PanelType) => {
            setPrimaryPanelState(panel);
            setPrimaryDocId(null);
            setSecondaryPanelState(null);
            setSecondaryDocId(null);
            mount(panel);
        },
        [mount],
    );

    const setSecondaryPanel = useCallback(
        (panel: PanelType | null) => {
            if (panel === primaryPanel) return;
            setSecondaryPanelState(panel);
            setSecondaryDocId(null);
            if (panel) {
                mount(panel);
            } else {
                setFocusedSideState("primary");
            }
        },
        [primaryPanel, mount],
    );

    const setFocusedSide = useCallback(
        (side: SplitSide) => {
            if (side === "secondary" && !secondaryPanel) return;
            setFocusedSideState(side);
        },
        [secondaryPanel],
    );

    const setFocusedPanel = useCallback(
        (panel: PanelType) => {
            mount(panel);

            if (!secondaryPanel) {
                setPrimaryPanelState(panel);
                setPrimaryDocId(null);
                return;
            }

            const currentOnFocused = focusedSide === "primary" ? primaryPanel : secondaryPanel;
            if (panel === currentOnFocused) return;

            const currentOnOther = focusedSide === "primary" ? secondaryPanel : primaryPanel;

            if (panel === currentOnOther) {
                // Requested panel is on the other side — swap both sides (panels + docs).
                setPrimaryPanelState(secondaryPanel);
                setSecondaryPanelState(primaryPanel);
                setPrimaryDocId(secondaryDocId);
                setSecondaryDocId(primaryDocId);
            } else if (focusedSide === "primary") {
                setPrimaryPanelState(panel);
                setPrimaryDocId(null);
            } else {
                setSecondaryPanelState(panel);
                setSecondaryDocId(null);
            }
        },
        [focusedSide, primaryPanel, secondaryPanel, primaryDocId, secondaryDocId, mount],
    );

    const setSidePanel = useCallback(
        (side: SplitSide, panel: PanelType) => {
            mount(panel);

            if (!secondaryPanel) {
                setPrimaryPanelState(panel);
                setPrimaryDocId(null);
                return;
            }

            const currentOnSide = side === "primary" ? primaryPanel : secondaryPanel;
            if (panel === currentOnSide) return;

            const currentOnOther = side === "primary" ? secondaryPanel : primaryPanel;
            if (panel === currentOnOther) {
                setPrimaryPanelState(secondaryPanel);
                setSecondaryPanelState(primaryPanel);
                setPrimaryDocId(secondaryDocId);
                setSecondaryDocId(primaryDocId);
            } else if (side === "primary") {
                setPrimaryPanelState(panel);
                setPrimaryDocId(null);
            } else {
                setSecondaryPanelState(panel);
                setSecondaryDocId(null);
            }
        },
        [primaryPanel, secondaryPanel, primaryDocId, secondaryDocId, mount],
    );

    const setSideDocument = useCallback((side: SplitSide, docId: string, kind: DocumentPanelKind) => {
        // Documents can live on both sides simultaneously (e.g. two boards), so
        // this sets the side's panel + doc directly without the de-duplication
        // swap logic that the singleton setters use.
        if (side === "primary") {
            setPrimaryPanelState(kind);
            setPrimaryDocId(docId);
        } else {
            setSecondaryPanelState(kind);
            setSecondaryDocId(docId);
        }
        setFocusedSideState(side);
    }, []);

    const splitWithDocument = useCallback(
        (docId: string, kind: DocumentPanelKind, side: SplitSide) => {
            if (side === "primary") {
                // New document takes the left; the existing panel slides right.
                setSecondaryPanelState(primaryPanel);
                setSecondaryDocId(primaryDocId);
                setPrimaryPanelState(kind);
                setPrimaryDocId(docId);
                setFocusedSideState("primary");
            } else {
                // Existing panel stays on the left; new document opens on the right.
                setSecondaryPanelState(kind);
                setSecondaryDocId(docId);
                setFocusedSideState("secondary");
            }
        },
        [primaryPanel, primaryDocId],
    );

    const closeDocument = useCallback((docId: string) => {
        setPrimaryDocId((prev) => (prev === docId ? null : prev));
        setSecondaryDocId((prev) => (prev === docId ? null : prev));
    }, []);

    const swapPanels = useCallback(() => {
        if (!secondaryPanel) return;
        setPrimaryPanelState(secondaryPanel);
        setSecondaryPanelState(primaryPanel);
        setPrimaryDocId(secondaryDocId);
        setSecondaryDocId(primaryDocId);
        setFocusedSideState((prev) => (prev === "primary" ? "secondary" : "primary"));
    }, [primaryPanel, secondaryPanel, primaryDocId, secondaryDocId]);

    const value = useMemo(
        () => ({
            primaryPanel,
            secondaryPanel,
            primaryDocId,
            secondaryDocId,
            splitRatio,
            isSplit,
            visiblePanels,
            mountedPanels,
            focusedSide,
            focusedPanel,
            isEndlessScroll,
            screenplayView,
            setScreenplayView,
            sceneCardColumns,
            setSceneCardColumns,
            showComments,
            leftSidebarOpen,
            rightSidebarOpen,
            timelineOpen,
            setTimelineOpen,
            chromeHidden,
            setChromeHidden,
            mobileEditMode,
            setMobileEditMode,
            setPrimaryPanel,
            setSecondaryPanel,
            setSplitRatio,
            setFocusedSide,
            setFocusedPanel,
            setSidePanel,
            setSideDocument,
            splitWithDocument,
            closeDocument,
            swapPanels,
            setIsEndlessScroll,
            onBeforeEndlessScrollChange,
            setShowComments,
            setLeftSidebarOpen,
            setRightSidebarOpen,
        }),
        [primaryPanel, secondaryPanel, primaryDocId, secondaryDocId, splitRatio, isSplit, visiblePanels, mountedPanels, focusedSide, focusedPanel, isEndlessScroll, screenplayView, sceneCardColumns, showComments, leftSidebarOpen, rightSidebarOpen, timelineOpen, chromeHidden, mobileEditMode, setPrimaryPanel, setSecondaryPanel, setFocusedSide, setFocusedPanel, setSidePanel, setSideDocument, splitWithDocument, closeDocument, swapPanels, setIsEndlessScroll, onBeforeEndlessScrollChange, setShowComments, setLeftSidebarOpen, setRightSidebarOpen],
    );

    return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
};

export default ViewContext;
