"use client";

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";

export type PanelType = "screenplay" | "board" | "statistics" | "title";
export type SplitSide = "primary" | "secondary";

interface ViewContextType {
    primaryPanel: PanelType;
    secondaryPanel: PanelType | null;
    splitRatio: number;
    isSplit: boolean;
    visiblePanels: PanelType[];
    mountedPanels: Set<PanelType>;
    focusedSide: SplitSide;
    focusedPanel: PanelType;
    setPrimaryPanel: (panel: PanelType) => void;
    setSecondaryPanel: (panel: PanelType | null) => void;
    setSplitRatio: (ratio: number) => void;
    setFocusedSide: (side: SplitSide) => void;
    setFocusedPanel: (panel: PanelType) => void;
}

const ViewContext = createContext<ViewContextType>(null!);

export const useViewContext = () => useContext(ViewContext);

export const ViewProvider = ({ children }: { children: ReactNode }) => {
    const [primaryPanel, setPrimaryPanelState] = useState<PanelType>("screenplay");
    const [secondaryPanel, setSecondaryPanelState] = useState<PanelType | null>(null);
    const [splitRatio, setSplitRatio] = useState(0.5);
    const [mountedPanels, setMountedPanels] = useState<Set<PanelType>>(() => new Set(["screenplay", "title"]));
    const [focusedSide, setFocusedSideState] = useState<SplitSide>("primary");

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

    const setPrimaryPanel = useCallback((panel: PanelType) => {
        setPrimaryPanelState(panel);
        setSecondaryPanelState(null);
        setMountedPanels((prev) => {
            if (prev.has(panel)) return prev;
            const next = new Set(prev);
            next.add(panel);
            return next;
        });
    }, []);

    const setSecondaryPanel = useCallback(
        (panel: PanelType | null) => {
            if (panel === primaryPanel) return;
            setSecondaryPanelState(panel);
            if (panel) {
                setMountedPanels((prev) => {
                    if (prev.has(panel)) return prev;
                    const next = new Set(prev);
                    next.add(panel);
                    return next;
                });
            } else {
                setFocusedSideState("primary");
            }
        },
        [primaryPanel],
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
            // Mount the panel lazily
            setMountedPanels((prev) => {
                if (prev.has(panel)) return prev;
                const next = new Set(prev);
                next.add(panel);
                return next;
            });

            if (!secondaryPanel) {
                // Not split: set as primary
                setPrimaryPanelState(panel);
                return;
            }

            // Split mode: update the focused side's panel
            const currentOnFocused = focusedSide === "primary" ? primaryPanel : secondaryPanel;
            if (panel === currentOnFocused) return;

            const currentOnOther = focusedSide === "primary" ? secondaryPanel : primaryPanel;

            if (panel === currentOnOther) {
                // Requested panel is on the other side — swap
                setPrimaryPanelState(secondaryPanel);
                setSecondaryPanelState(primaryPanel);
            } else {
                // Replace the focused side's panel
                if (focusedSide === "primary") {
                    setPrimaryPanelState(panel);
                } else {
                    setSecondaryPanelState(panel);
                }
            }
        },
        [focusedSide, primaryPanel, secondaryPanel],
    );

    const value = useMemo(
        () => ({
            primaryPanel,
            secondaryPanel,
            splitRatio,
            isSplit,
            visiblePanels,
            mountedPanels,
            focusedSide,
            focusedPanel,
            setPrimaryPanel,
            setSecondaryPanel,
            setSplitRatio,
            setFocusedSide,
            setFocusedPanel,
        }),
        [primaryPanel, secondaryPanel, splitRatio, isSplit, visiblePanels, mountedPanels, focusedSide, focusedPanel, setPrimaryPanel, setSecondaryPanel, setFocusedSide, setFocusedPanel],
    );

    return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
};

export default ViewContext;
