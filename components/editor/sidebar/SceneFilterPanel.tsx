"use client";

import { RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, Clock, Compass, MapPin, Users, X } from "lucide-react";
import { join } from "@src/lib/utils/misc";
import {
    FacetOption,
    SceneFilter,
    isSceneFilterActive,
    toggleFilterValue,
} from "@src/lib/screenplay/scene-filters";

import styles from "./SceneFilterPanel.module.css";

// Layout effect on the client (flash-free positioning), plain effect on the
// server to avoid React's "useLayoutEffect does nothing on the server" warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const PANEL_WIDTH = 280;
const VIEWPORT_MARGIN = 8;
/** How long typed letters keep accumulating before the next one starts a fresh
 *  search — the same idea as a native <select>'s typeahead. */
const TYPEAHEAD_RESET_MS = 1000;

interface SceneFilterPanelProps {
    /** The header button the panel hangs under. */
    anchorRef: RefObject<HTMLElement | null>;
    filter: SceneFilter;
    onChange: (filter: SceneFilter) => void;
    onClear: () => void;
    onClose: () => void;
    options: Record<keyof SceneFilter, FacetOption[]>;
}

const SceneFilterPanel = ({ anchorRef, filter, onChange, onClear, onClose, options }: SceneFilterPanelProps) => {
    const t = useTranslations("editorSidebar");
    const panelRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    // One dimension's menu is open at a time, like any other dropdown here.
    const [openDimension, setOpenDimension] = useState<keyof SceneFilter | null>(null);
    // Value the typeahead has landed on, highlighted as though hovered.
    const [highlighted, setHighlighted] = useState<string | null>(null);
    // Letters typed since the last pause; transient, so a ref rather than state.
    const typedRef = useRef("");
    const typedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const highlightRef = useRef<HTMLButtonElement>(null);

    const resetTypeahead = useCallback(() => {
        typedRef.current = "";
        if (typedTimerRef.current) clearTimeout(typedTimerRef.current);
        typedTimerRef.current = null;
        setHighlighted(null);
    }, []);

    const toggleDimension = useCallback(
        (dimension: keyof SceneFilter) => {
            setOpenDimension((open) => (open === dimension ? null : dimension));
            resetTypeahead();
        },
        [resetTypeahead],
    );

    // The sidebar panel clips its overflow, so this renders in a body portal and
    // is positioned from the button's box — clamped so it never runs off the
    // right edge of the viewport.
    const updatePosition = useCallback(() => {
        const anchor = anchorRef.current;
        if (!anchor) return;

        const rect = anchor.getBoundingClientRect();
        const left = Math.max(
            VIEWPORT_MARGIN,
            Math.min(rect.left, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN),
        );
        setPosition({ top: rect.bottom + 6, left });
    }, [anchorRef]);

    useIsoLayoutEffect(() => {
        updatePosition();
    }, [updatePosition]);

    useEffect(() => {
        const onMove = () => updatePosition();
        window.addEventListener("scroll", onMove, true);
        window.addEventListener("resize", onMove);
        return () => {
            window.removeEventListener("scroll", onMove, true);
            window.removeEventListener("resize", onMove);
        };
    }, [updatePosition]);

    // Close on outside click (the button toggles the panel itself, so it is
    // excluded here) and on Escape.
    useEffect(() => {
        const onPointerDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
            onClose();
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [anchorRef, onClose]);

    // Typeahead over the open menu: typed letters walk to the first value that
    // starts with them (falling back to one that merely contains them), which is
    // highlighted as if hovered. Enter picks it.
    //
    // Listens in the capture phase and swallows what it consumes: the screenplay
    // editor may still hold focus, and its keydown handler sits on its own
    // element — which a document-level bubble listener would run *after*, typing
    // the letters into the script.
    useEffect(() => {
        if (!openDimension) return;
        const values = options[openDimension];

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.altKey || e.ctrlKey || e.metaKey) return;

            if (e.key === "Enter") {
                if (!highlighted) return;
                e.preventDefault();
                e.stopPropagation();
                onChange(toggleFilterValue(filter, openDimension, highlighted));
                return;
            }

            if (e.key === "Backspace") {
                e.preventDefault();
                e.stopPropagation();
                resetTypeahead();
                return;
            }

            // Printable characters only — everything else (arrows, Tab, Escape)
            // is left to the browser and the panel's other handlers. A bare
            // space still activates the focused control; once a search is under
            // way it joins the term, since locations run to several words.
            if (e.key.length !== 1) return;
            if (e.key === " " && typedRef.current === "") return;

            e.preventDefault();
            e.stopPropagation();

            typedRef.current += e.key.toUpperCase();
            const typed = typedRef.current;
            const match =
                values.find((option) => option.value.startsWith(typed)) ??
                values.find((option) => option.value.includes(typed));
            if (match) setHighlighted(match.value);

            if (typedTimerRef.current) clearTimeout(typedTimerRef.current);
            typedTimerRef.current = setTimeout(() => {
                typedRef.current = "";
            }, TYPEAHEAD_RESET_MS);
        };

        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
    }, [openDimension, options, filter, highlighted, onChange, resetTypeahead]);

    // Drop any pending reset timer if the panel closes mid-search.
    useEffect(() => {
        return () => {
            if (typedTimerRef.current) clearTimeout(typedTimerRef.current);
        };
    }, []);

    // Reveal the highlighted row. Scrolls the menu box itself rather than
    // calling scrollIntoView, which walks every scrollable ancestor and can
    // escalate to the document (see EditorSidebarNavigation for the bug that
    // caused on phone).
    useEffect(() => {
        const list = listRef.current;
        const item = highlightRef.current;
        if (!list || !item) return;

        const itemRect = item.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        if (itemRect.top < listRect.top) list.scrollTop -= listRect.top - itemRect.top;
        else if (itemRect.bottom > listRect.bottom) list.scrollTop += itemRect.bottom - listRect.bottom;
    }, [highlighted]);

    /** What the closed trigger reports: the value itself while a single one is
     *  picked, a count once several are, and "any" while the dimension is off. */
    const summarise = (selected: string[]): string => {
        if (selected.length === 0) return t("filterAny");
        if (selected.length === 1) return selected[0];
        return t("filterSelected", { count: selected.length });
    };

    const renderSection = (dimension: keyof SceneFilter, title: string, icon: React.ReactNode) => {
        const values = options[dimension];
        const selected = filter[dimension];
        const isOpen = openDimension === dimension;
        const isEmpty = values.length === 0;

        return (
            <div className={styles.section}>
                <button
                    className={join(styles.trigger, selected.length > 0 ? styles.trigger_active : "")}
                    onClick={() => toggleDimension(dimension)}
                    disabled={isEmpty}
                >
                    <span className={styles.trigger_icon}>{icon}</span>
                    <span className={styles.trigger_label}>{title}</span>
                    <span className={styles.trigger_value}>
                        {isEmpty ? t("filterNoOptions") : summarise(selected)}
                    </span>
                    <ChevronDown
                        size={14}
                        className={join(styles.chevron, isOpen ? styles.chevron_open : "")}
                    />
                </button>
                {isOpen && (
                    <div ref={listRef} className={styles.menu}>
                        {values.map((option) => {
                            const isPicked = selected.includes(option.value);
                            const isHighlighted = option.value === highlighted;
                            return (
                                <button
                                    key={option.value}
                                    ref={isHighlighted ? highlightRef : undefined}
                                    className={join(
                                        styles.option,
                                        isPicked ? styles.option_selected : "",
                                        isHighlighted ? styles.option_highlighted : "",
                                    )}
                                    onClick={() => onChange(toggleFilterValue(filter, dimension, option.value))}
                                >
                                    <span className={styles.option_label}>{option.value}</span>
                                    <span className={styles.option_count}>{option.count}</span>
                                    <span className={styles.option_check}>
                                        {isPicked && <Check size={12} strokeWidth={3} />}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    const panel = (
        <div
            ref={panelRef}
            className={styles.container}
            style={position ? { top: position.top, left: position.left } : { visibility: "hidden" }}
        >
            <div className={styles.header}>
                <span className={styles.title}>{t("filterScenes")}</span>
                <div className={styles.header_actions}>
                    <button
                        className={styles.clear_btn}
                        onClick={onClear}
                        disabled={!isSceneFilterActive(filter)}
                    >
                        {t("filterClear")}
                    </button>
                    <button className={styles.close_btn} onClick={onClose} aria-label="Close">
                        <X size={14} />
                    </button>
                </div>
            </div>
            <div className={styles.body}>
                {renderSection("characters", t("characters"), <Users size={13} />)}
                {renderSection("locations", t("locations"), <MapPin size={13} />)}
                {renderSection("timesOfDay", t("filterTimeOfDay"), <Clock size={13} />)}
                {renderSection("sceneTypes", t("filterSceneType"), <Compass size={13} />)}
            </div>
        </div>
    );

    if (typeof document === "undefined") return null;
    return createPortal(panel, document.body);
};

export default SceneFilterPanel;
