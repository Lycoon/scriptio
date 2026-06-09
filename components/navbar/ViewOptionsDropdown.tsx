"use client";

import { useContext, useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { UserContext } from "@src/context/UserContext";
import { PanelType, useViewContext } from "@src/context/ViewContext";
import {
    ChevronDown,
    Scroll,
    MessageSquare,
    MessageSquareOff,
    Maximize,
    Minimize,
    PanelRight,
    PanelRightClose,
    ArrowLeftRight,
    Eye,
    ListTree,
} from "lucide-react";

import styles from "./ViewOptionsDropdown.module.css";

const ViewOptionsDropdown = () => {
    const t = useTranslations("navbar");
    const { isZenMode, updateIsZenMode } = useContext(UserContext);
    const {
        isEndlessScroll,
        setIsEndlessScroll,
        showComments,
        setShowComments,
        setLeftSidebarOpen,
        setRightSidebarOpen,
        isSplit,
        primaryPanel,
        setSecondaryPanel,
        swapPanels,
        focusedPanel,
        setFocusedPanel,
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
    const sidebarsBeforeFocus = useRef<{ left: boolean; right: boolean } | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        window.addEventListener("mousedown", handleClickOutside);
        return () => window.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

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

    // Sync zen mode state when user exits fullscreen via Escape
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
        <div className={styles.container} ref={dropdownRef}>
            <button className={styles.trigger} onClick={() => setIsOpen(!isOpen)}>
                <Eye size={16} />
                <ChevronDown
                    size={14}
                    className={`${styles.chevron} ${isOpen ? styles.chevron_open : ""}`}
                />
            </button>

            {isOpen && (
                <div className={styles.dropdown_menu}>
                    <button
                        className={`${styles.dropdown_item} ${focusedPanel === "outline" ? styles.dropdown_item_active : ""}`}
                        onClick={() => {
                            setFocusedPanel("outline");
                            setIsOpen(false);
                        }}
                    >
                        <ListTree size={16} />
                        <span className={styles.item_label}>{t("outline")}</span>
                    </button>
                    <button
                        className={`${styles.dropdown_item} ${isEndlessScroll ? styles.dropdown_item_active : ""}`}
                        onClick={() => setIsEndlessScroll(!isEndlessScroll)}
                    >
                        <Scroll size={16} />
                        <span className={styles.item_label}>{t("endlessScroll")}</span>
                    </button>
                    <button
                        className={`${styles.dropdown_item} ${!showComments ? styles.dropdown_item_active : ""}`}
                        onClick={() => setShowComments(!showComments)}
                    >
                        {showComments ? (
                            <MessageSquare size={16} />
                        ) : (
                            <MessageSquareOff size={16} />
                        )}
                        <span className={styles.item_label}>{t("toggleComments")}</span>
                    </button>
                    <button
                        className={`${styles.dropdown_item} ${isZenMode ? styles.dropdown_item_active : ""}`}
                        onClick={isZenMode ? exitFocusMode : enterFocusMode}
                    >
                        {isZenMode ? <Minimize size={16} /> : <Maximize size={16} />}
                        <span className={styles.item_label}>{t("focusMode")}</span>
                    </button>
                    <button
                        className={`${styles.dropdown_item} ${isSplit ? styles.dropdown_item_active : ""}`}
                        onClick={handleSplitToggle}
                    >
                        {isSplit ? <PanelRightClose size={16} /> : <PanelRight size={16} />}
                        <span className={styles.item_label}>{isSplit ? t("unsplitPanel") : t("splitPanel")}</span>
                    </button>
                    <button
                        className={styles.dropdown_item}
                        onClick={swapPanels}
                        disabled={!isSplit}
                    >
                        <ArrowLeftRight size={16} />
                        <span className={styles.item_label}>{t("swapPanels")}</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default ViewOptionsDropdown;
