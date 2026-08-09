"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DocumentPanelKind, PanelType, SplitSide, useViewContext } from "@src/context/ViewContext";
import { join } from "@src/lib/utils/misc";
import { useIsPhone } from "@src/lib/utils/hooks";
import { DOC_DND_MIME } from "@components/editor/sidebar/DocumentTreeItem";
import EditorPanel from "@components/editor/EditorPanel";
import TitlePagePanel from "@components/editor/TitlePagePanel";
import DraftEditorPanel from "@components/editor/DraftEditorPanel";
import TreeDocumentPanel from "@components/editor/TreeDocumentPanel";
import BoardPanel from "@components/editor/BoardPanel";
import SceneCardsPanel from "@components/editor/SceneCardsPanel";
import ScreenplayViewSwitcher from "./ScreenplayViewSwitcher";
import StatisticsClientPage from "@components/projects/stats/StatisticsClientPage";
import DragHandle from "./DragHandle";
import { SuggestionData } from "@components/editor/SuggestionMenu";
import {
    ArrowLeftRight,
    ChevronLeft,
    ChevronRight,
    Clapperboard,
    FileText,
    GanttChartSquare,
    Menu,
    PanelRight,
    PanelRightClose,
} from "lucide-react";
import styles from "./SplitPanelContainer.module.css";
import dropdown from "./PanelMenu.module.css";

interface SplitPanelContainerProps {
    suggestions: string[];
    updateSuggestions: (suggestions: string[]) => void;
    suggestionData: SuggestionData;
    updateSuggestionData: (data: SuggestionData) => void;
}

const PanelRenderer = ({
    panel,
    isVisible,
    suggestions,
    updateSuggestions,
    suggestionData,
    updateSuggestionData,
}: { panel: PanelType; isVisible: boolean } & SplitPanelContainerProps) => {
    const { screenplayView } = useViewContext();

    switch (panel) {
        case "screenplay": {
            // The index-card grid covers the editor rather than replacing it:
            // unmounting the screenplay editor would tear down its Yjs binding
            // and null the handle ProjectContext hands to the sidebar, the
            // search and the timeline. `isVisible` false while the cards are up
            // also parks it properly — blurred, with no caret for WebKit to
            // chase (see DocumentEditorPanel).
            const cardsUp = isVisible && screenplayView === "cards";
            return (
                <>
                    <EditorPanel
                        isVisible={isVisible && !cardsUp}
                        suggestions={suggestions}
                        updateSuggestions={updateSuggestions}
                        suggestionData={suggestionData}
                        updateSuggestionData={updateSuggestionData}
                    />
                    {cardsUp && <SceneCardsPanel />}
                </>
            );
        }
        case "statistics":
            return <StatisticsClientPage />;
        case "title":
            return <TitlePagePanel isVisible={isVisible} />;
        case "draft":
            return <DraftEditorPanel isVisible={isVisible} />;
        default:
            // board/document are document panels, rendered per-side (not here).
            return null;
    }
};

// Singleton view panels are kept mounted and swapped in/out via CSS so heavy
// editors don't reinitialise. Board/editor documents are rendered per-side
// instead, so two documents can be open at once.
const SINGLETON_PANELS: PanelType[] = ["screenplay", "statistics", "title", "draft"];

// Boards and tree documents are opened from the document-tree sidebar (they are
// per-document), so they are not listed here.
const SWITCHABLE_PANELS: { type: PanelType; icon: typeof Clapperboard; labelKey: string }[] = [
    { type: "screenplay", icon: Clapperboard, labelKey: "screenplay" },
    { type: "title", icon: FileText, labelKey: "titlePage" },
];

const PanelSwitcherMenu = ({ currentPanel, side }: { currentPanel: PanelType; side: "primary" | "secondary" }) => {
    const t = useTranslations("navbar");
    const isPhone = useIsPhone();
    const {
        setSidePanel,
        isSplit,
        primaryPanel,
        setSecondaryPanel,
        swapPanels,
        leftSidebarOpen,
        setLeftSidebarOpen,
        timelineOpen,
        setTimelineOpen,
    } = useViewContext();

    const handleSplitToggle = useCallback(() => {
        if (isSplit) {
            setSecondaryPanel(null);
        } else {
            // Default the new side to a singleton view (documents need a docId,
            // which only opening from the sidebar/outline provides).
            const other: PanelType = primaryPanel === "screenplay" ? "title" : "screenplay";
            setSecondaryPanel(other);
        }
    }, [isSplit, primaryPanel, setSecondaryPanel]);
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
        };
        window.addEventListener("mousedown", handleClickOutside);
        return () => window.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    const handleSelect = useCallback(
        (panel: PanelType) => {
            if (panel !== currentPanel) setSidePanel(side, panel);
            setIsOpen(false);
        },
        [currentPanel, side, setSidePanel],
    );

    return (
        <div ref={ref} className={join(styles.panel_switcher_anchor, timelineOpen ? styles.timeline_open : "")}>
            {side === "primary" && (
                <button className={styles.panel_switcher_btn} onClick={() => setLeftSidebarOpen((prev) => !prev)}>
                    {leftSidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                </button>
            )}
            <button className={styles.panel_switcher_btn} onClick={() => setIsOpen(!isOpen)}>
                <Menu size={14} />
            </button>
            {isOpen && (
                <div className={dropdown.dropdown_menu} style={{ left: 0, transform: "none" }}>
                    {/* How the script is rendered — only over a screenplay. */}
                    {currentPanel === "screenplay" && (
                        <ScreenplayViewSwitcher size={14} onSelect={() => setIsOpen(false)} />
                    )}
                    {/* Split view is single-panel-only on phones. */}
                    {!isPhone && (
                        <>
                            <button
                                className={`${dropdown.dropdown_item} ${isSplit ? dropdown.dropdown_item_active : ""}`}
                                onClick={() => {
                                    handleSplitToggle();
                                    setIsOpen(false);
                                }}
                            >
                                {isSplit ? <PanelRightClose size={14} /> : <PanelRight size={14} />}
                                <span className={dropdown.item_label}>{isSplit ? t("unsplitPanel") : t("splitPanel")}</span>
                            </button>
                            <button
                                className={dropdown.dropdown_item}
                                onClick={() => {
                                    swapPanels();
                                    setIsOpen(false);
                                }}
                                disabled={!isSplit}
                            >
                                <ArrowLeftRight size={14} />
                                <span className={dropdown.item_label}>{t("swapPanels")}</span>
                            </button>
                            <div className={styles.panel_switcher_separator} />
                        </>
                    )}
                    {SWITCHABLE_PANELS.map(({ type, icon: Icon, labelKey }) => (
                        <button
                            key={type}
                            className={`${dropdown.dropdown_item} ${type === currentPanel ? dropdown.dropdown_item_active : ""}`}
                            onClick={() => handleSelect(type)}
                        >
                            <Icon size={14} />
                            <span className={dropdown.item_label}>{t(labelKey as Parameters<typeof t>[0])}</span>
                        </button>
                    ))}
                    <div className={styles.panel_switcher_separator} />
                    {/* Timeline strip toggle — available on every platform. It
                        toggles a strip rather than choosing what the panel shows,
                        so it sits below the panel list in its own section. */}
                    <button
                        className={`${dropdown.dropdown_item} ${timelineOpen ? dropdown.dropdown_item_active : ""}`}
                        onClick={() => {
                            setTimelineOpen((prev) => !prev);
                            setIsOpen(false);
                        }}
                    >
                        <GanttChartSquare size={14} />
                        <span className={dropdown.item_label}>{t("timeline")}</span>
                    </button>
                </div>
            )}
        </div>
    );
};

// Drop zone within a panel: "center" replaces the panel's content, while the
// "left"/"right" edges split it and open the document on that side.
type DropZone = "left" | "center" | "right";

// Fraction of the panel width on each side that counts as a split edge.
const SPLIT_EDGE_RATIO = 0.3;

const computeDropZone = (e: React.DragEvent, allowSplit: boolean): DropZone => {
    if (!allowSplit) return "center";
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * SPLIT_EDGE_RATIO) return "left";
    if (x > rect.width * (1 - SPLIT_EDGE_RATIO)) return "right";
    return "center";
};

const SplitPanelContainer = ({
    suggestions,
    updateSuggestions,
    suggestionData,
    updateSuggestionData,
}: SplitPanelContainerProps) => {
    const {
        primaryPanel,
        secondaryPanel,
        primaryDocId,
        secondaryDocId,
        splitRatio,
        isSplit,
        mountedPanels,
        focusedSide,
        setFocusedSide,
        setSideDocument,
        splitWithDocument,
    } = useViewContext();

    const isPhone = useIsPhone();
    // On phone only one panel is ever visible: collapse any active split down to
    // the primary side (the split state is preserved, just not rendered).
    const showSplit = isSplit && !isPhone;
    const canSplit = !isSplit && !isPhone;

    // Where a document dragged from the sidebar would land: which side it is over
    // and which zone of that side ("center" replaces the panel; "left"/"right"
    // splits, opening the document on that edge).
    const [docDragOver, setDocDragOver] = useState<{ side: SplitSide; zone: DropZone } | null>(null);

    // Capture-phase so the panel claims a document drop before the editor's own
    // drop handling sees it; non-document drags fall through untouched.
    const handleDocDragOver = useCallback(
        (side: SplitSide) => (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes(DOC_DND_MIME)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            // Edge zones only split when there is room for a second panel.
            const zone = computeDropZone(e, canSplit);
            setDocDragOver((prev) => (prev?.side === side && prev.zone === zone ? prev : { side, zone }));
        },
        [canSplit],
    );

    const handleDocDrop = useCallback(
        (side: SplitSide) => (e: React.DragEvent) => {
            const raw = e.dataTransfer.getData(DOC_DND_MIME);
            if (!raw) return;
            e.preventDefault();
            e.stopPropagation();
            const zone = computeDropZone(e, canSplit);
            setDocDragOver(null);
            let data: { id: string; type: "editor" | "board" };
            try {
                data = JSON.parse(raw);
            } catch {
                return;
            }
            const kind: DocumentPanelKind = data.type === "board" ? "board" : "document";
            if (zone === "center") {
                setSideDocument(side, data.id, kind);
            } else {
                splitWithDocument(data.id, kind, zone === "left" ? "primary" : "secondary");
            }
        },
        [canSplit, setSideDocument, splitWithDocument],
    );

    const gridStyle = useMemo(() => {
        if (!showSplit) {
            return { gridTemplateColumns: "1fr" };
        }
        // Use calc() with percentages instead of fractional fr units.
        // Fractional fr values (e.g. 0.5fr) trigger expensive grid track
        // recalculations on every layout pass, causing editor freezes.
        const leftPct = splitRatio * 100;
        const rightPct = (1 - splitRatio) * 100;
        return {
            gridTemplateColumns: `calc(${leftPct}% - ${splitRatio * 6}px) 6px calc(${rightPct}% - ${(1 - splitRatio) * 6}px)`,
        };
    }, [showSplit, splitRatio]);

    // Shared wrapper for one slot: focus styling, document drop target, switcher.
    const renderShell = (opts: {
        keyId: string;
        panelKind: PanelType;
        side: SplitSide;
        isPrimary: boolean;
        isVisible: boolean;
        content: React.ReactNode;
    }) => {
        const { keyId, panelKind, side, isPrimary, isVisible, content } = opts;
        const isFocused = showSplit && isVisible && focusedSide === side;
        const dropZone = isVisible && docDragOver?.side === side ? docDragOver.zone : null;
        const panelClass = !isVisible
            ? styles.panel_hidden
            : `${styles.panel}${isFocused ? ` ${styles.panel_focused}` : ""}`;

        return (
            <div
                key={keyId}
                className={panelClass}
                style={isVisible ? { order: isPrimary ? 0 : 2, position: "relative" } : undefined}
                onPointerDown={isVisible && showSplit ? () => setFocusedSide(side) : undefined}
                onDragOverCapture={isVisible ? handleDocDragOver(side) : undefined}
                onDropCapture={isVisible ? handleDocDrop(side) : undefined}
                onDragLeave={
                    isVisible
                        ? (e) => {
                              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDocDragOver(null);
                          }
                        : undefined
                }
            >
                {dropZone && (
                    <div
                        className={join(
                            styles.panel_drop_overlay,
                            dropZone === "left" ? styles.panel_drop_overlay_left : "",
                            dropZone === "right" ? styles.panel_drop_overlay_right : "",
                        )}
                    />
                )}
                {isVisible && <PanelSwitcherMenu currentPanel={panelKind} side={side} />}
                {content}
            </div>
        );
    };

    return (
        <div className={styles.split_panel_container} style={gridStyle}>
            {/* Singleton view panels — kept mounted, shown/hidden via CSS. */}
            {SINGLETON_PANELS.map((panel) => {
                if (!mountedPanels.has(panel)) return null;
                const isPrimary = panel === primaryPanel;
                const isSecondary = panel === secondaryPanel;
                // Phone shows the primary side only, even if a split is active.
                const isVisible = isPrimary || (isSecondary && !isPhone);
                return renderShell({
                    keyId: panel,
                    panelKind: panel,
                    side: isPrimary ? "primary" : "secondary",
                    isPrimary,
                    isVisible,
                    content: (
                        <PanelRenderer
                            panel={panel}
                            isVisible={isVisible}
                            suggestions={suggestions}
                            updateSuggestions={updateSuggestions}
                            suggestionData={suggestionData}
                            updateSuggestionData={updateSuggestionData}
                        />
                    ),
                });
            })}

            {/* Document panels — one per side, each bound to its own docId so two
                documents (e.g. two boards, or a board + an editor) can be open. */}
            {(["primary", "secondary"] as SplitSide[]).map((side) => {
                // Phone shows the primary side only.
                if (side === "secondary" && isPhone) return null;
                const panelKind = side === "primary" ? primaryPanel : secondaryPanel;
                if (panelKind !== "board" && panelKind !== "document") return null;
                const docId = side === "primary" ? primaryDocId : secondaryDocId;
                return renderShell({
                    keyId: `doc-${side}`,
                    panelKind,
                    side,
                    isPrimary: side === "primary",
                    isVisible: true,
                    content:
                        panelKind === "board" ? (
                            <BoardPanel isVisible docId={docId} />
                        ) : (
                            <TreeDocumentPanel isVisible docId={docId} />
                        ),
                });
            })}

            {showSplit && (
                <div style={{ order: 1, height: "100%" }}>
                    <DragHandle />
                </div>
            )}
        </div>
    );
};

export default SplitPanelContainer;
