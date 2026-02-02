"use client";

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";

export type PanelType = "screenplay" | "board" | "statistics";

interface ViewContextType {
    primaryPanel: PanelType;
    secondaryPanel: PanelType | null;
    splitRatio: number;
    mountedPanels: Set<PanelType>;
    isSplit: boolean;
    visiblePanels: PanelType[];
    setPrimaryPanel: (panel: PanelType) => void;
    setSecondaryPanel: (panel: PanelType | null) => void;
    setSplitRatio: (ratio: number) => void;
}

const ViewContext = createContext<ViewContextType>(null!);

export const useViewContext = () => useContext(ViewContext);

export const ViewProvider = ({ children }: { children: ReactNode }) => {
    const [primaryPanel, setPrimaryPanelState] = useState<PanelType>("screenplay");
    const [secondaryPanel, setSecondaryPanelState] = useState<PanelType | null>(null);
    const [splitRatio, setSplitRatio] = useState(0.5);
    const [mountedPanels, setMountedPanels] = useState<Set<PanelType>>(() => new Set(["screenplay"]));

    const isSplit = secondaryPanel !== null;

    const visiblePanels = useMemo(() => {
        const panels: PanelType[] = [primaryPanel];
        if (secondaryPanel) panels.push(secondaryPanel);
        return panels;
    }, [primaryPanel, secondaryPanel]);

    const setPrimaryPanel = useCallback((panel: PanelType) => {
        setPrimaryPanelState(panel);
        setSecondaryPanelState(null);
        setMountedPanels((prev) => new Set(prev).add(panel));
    }, []);

    const setSecondaryPanel = useCallback(
        (panel: PanelType | null) => {
            if (panel === primaryPanel) return;
            setSecondaryPanelState(panel);
            if (panel) {
                setMountedPanels((prev) => new Set(prev).add(panel));
            }
        },
        [primaryPanel],
    );

    const value = useMemo(
        () => ({
            primaryPanel,
            secondaryPanel,
            splitRatio,
            mountedPanels,
            isSplit,
            visiblePanels,
            setPrimaryPanel,
            setSecondaryPanel,
            setSplitRatio,
        }),
        [primaryPanel, secondaryPanel, splitRatio, mountedPanels, isSplit, visiblePanels, setPrimaryPanel, setSecondaryPanel],
    );

    return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
};

export default ViewContext;
