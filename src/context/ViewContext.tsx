"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";

/** Phone breakpoint — mirrors the `(max-width: 767px)` CSS blocks and useIsPhone. */
const isPhoneViewport = () =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

export type PanelType = "screenplay" | "board" | "statistics" | "title" | "draft" | "document";
export type SplitSide = "primary" | "secondary";

/** Panel kinds that display a specific document, and so carry a docId per side. */
export type DocumentPanelKind = "board" | "document";

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
    showComments: boolean;
    leftSidebarOpen: boolean;
    rightSidebarOpen: boolean;
    /** Whether the horizontal Timeline strip is open beneath the project navbar. */
    timelineOpen: boolean;
    setTimelineOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
    /**
     * Phone-only: hide the floating editor chrome (project navbar + sidebar edge
     * handles) while the reader scrolls down through the script, so it doesn't
     * cover the page. Reset to false on scroll-up or when the user types.
     */
    chromeHidden: boolean;
    setChromeHidden: (value: boolean | ((prev: boolean) => boolean)) => void;
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
    const [isEndlessScroll, setIsEndlessScroll] = useState<boolean>(isPhoneViewport);
    const [showComments, setShowComments] = useState<boolean>(true);
    const [leftSidebarOpen, setLeftSidebarOpenState] = useState<boolean>(false);
    const [rightSidebarOpen, setRightSidebarOpenState] = useState<boolean>(false);
    const [timelineOpen, setTimelineOpen] = useState<boolean>(false);
    const [chromeHidden, setChromeHidden] = useState<boolean>(false);

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
            showComments,
            leftSidebarOpen,
            rightSidebarOpen,
            timelineOpen,
            setTimelineOpen,
            chromeHidden,
            setChromeHidden,
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
            setShowComments,
            setLeftSidebarOpen,
            setRightSidebarOpen,
        }),
        [primaryPanel, secondaryPanel, primaryDocId, secondaryDocId, splitRatio, isSplit, visiblePanels, mountedPanels, focusedSide, focusedPanel, isEndlessScroll, showComments, leftSidebarOpen, rightSidebarOpen, timelineOpen, chromeHidden, setPrimaryPanel, setSecondaryPanel, setFocusedSide, setFocusedPanel, setSidePanel, setSideDocument, splitWithDocument, closeDocument, swapPanels, setIsEndlessScroll, setShowComments, setLeftSidebarOpen, setRightSidebarOpen],
    );

    return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
};

export default ViewContext;
