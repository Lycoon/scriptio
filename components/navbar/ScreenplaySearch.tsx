"use client";

import { useContext, useRef, useEffect, useCallback, useState } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { ScreenplayElement } from "@src/lib/utils/enums";
import { scrollToMatch } from "@src/lib/screenplay/extensions/search-highlight-extension";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";
import styles from "./ScreenplaySearch.module.css";

const DEBOUNCE_MS = 300;

const FILTER_LABELS: Record<ScreenplayElement, string> = {
    [ScreenplayElement.Scene]: "Scene Heading",
    [ScreenplayElement.Action]: "Action",
    [ScreenplayElement.Character]: "Character",
    [ScreenplayElement.Dialogue]: "Dialogue",
    [ScreenplayElement.Parenthetical]: "Parenthetical",
    [ScreenplayElement.Transition]: "Transition",
    [ScreenplayElement.Section]: "Section",
    [ScreenplayElement.Note]: "Note",
    [ScreenplayElement.None]: "None",
};

const FILTER_ORDER: ScreenplayElement[] = [
    ScreenplayElement.Scene,
    ScreenplayElement.Action,
    ScreenplayElement.Character,
    ScreenplayElement.Dialogue,
    ScreenplayElement.Parenthetical,
    ScreenplayElement.Transition,
    ScreenplayElement.Section,
    ScreenplayElement.Note,
];

const ScreenplaySearch = () => {
    const {
        editor,
        setSearchTerm,
        searchFilters,
        setSearchFilters,
        currentSearchIndex,
        setCurrentSearchIndex,
        searchMatches,
    } = useContext(ProjectContext);

    const [isOpen, setIsOpen] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, []);

    // Close search when clicking outside
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        window.addEventListener("mousedown", handleClickOutside);
        return () => window.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    // Focus input when opening
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const handleOpen = useCallback(() => {
        setIsOpen(true);
    }, []);

    const handleClose = useCallback(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        setIsOpen(false);
        if (inputRef.current) {
            inputRef.current.value = "";
        }
        setSearchTerm("");
    }, [setSearchTerm]);

    // Use uncontrolled input with debounced updates to context
    const handleSearchChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value;

            // Clear pending debounce
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }

            // Debounce the expensive search operation
            debounceRef.current = setTimeout(() => {
                setSearchTerm(value);
            }, DEBOUNCE_MS);
        },
        [setSearchTerm],
    );

    const toggleFilter = useCallback(
        (element: ScreenplayElement) => {
            const newFilters = new Set(searchFilters);
            if (newFilters.has(element)) {
                newFilters.delete(element);
            } else {
                newFilters.add(element);
            }
            setSearchFilters(newFilters);
        },
        [searchFilters, setSearchFilters],
    );

    const goToNextMatch = useCallback(() => {
        if (searchMatches.length === 0 || !editor) return;
        const nextIndex = (currentSearchIndex + 1) % searchMatches.length;
        setCurrentSearchIndex(nextIndex);
        scrollToMatch(editor, searchMatches[nextIndex]);
    }, [editor, searchMatches, currentSearchIndex, setCurrentSearchIndex]);

    const goToPreviousMatch = useCallback(() => {
        if (searchMatches.length === 0 || !editor) return;
        const prevIndex = (currentSearchIndex - 1 + searchMatches.length) % searchMatches.length;
        setCurrentSearchIndex(prevIndex);
        scrollToMatch(editor, searchMatches[prevIndex]);
    }, [editor, searchMatches, currentSearchIndex, setCurrentSearchIndex]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) {
                handleClose();
            }
            if (e.key === "Enter" && isOpen && searchMatches.length > 0) {
                e.preventDefault();
                if (e.shiftKey) {
                    goToPreviousMatch();
                } else {
                    goToNextMatch();
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, searchMatches.length, handleClose, goToPreviousMatch, goToNextMatch]);

    return (
        <div className={styles.container} ref={containerRef}>
            <div className={`${styles.search_wrapper} ${isOpen ? styles.search_wrapper_open : ""}`}>
                {isOpen && (
                    <input
                        ref={inputRef}
                        type="text"
                        className={styles.search_input}
                        placeholder="Search..."
                        defaultValue=""
                        onChange={handleSearchChange}
                    />
                )}
                <div
                    className={`${styles.search_btn} ${isOpen ? styles.search_btn_active : ""}`}
                    onClick={isOpen ? undefined : handleOpen}
                >
                    <Search size={18} />
                </div>
            </div>

            {isOpen && (
                <div className={styles.dropdown}>
                    {/* Navigation section */}
                    <div className={styles.navigation}>
                        <button
                            className={styles.nav_btn}
                            onClick={goToPreviousMatch}
                            disabled={searchMatches.length === 0}
                        >
                            <ChevronUp size={18} />
                        </button>
                        <span className={styles.match_count}>
                            {searchMatches.length > 0
                                ? `${currentSearchIndex + 1} of ${searchMatches.length}`
                                : "No matches"}
                        </span>
                        <button
                            className={styles.nav_btn}
                            onClick={goToNextMatch}
                            disabled={searchMatches.length === 0}
                        >
                            <ChevronDown size={18} />
                        </button>
                        <button className={styles.close_btn} onClick={handleClose}>
                            <X size={16} />
                        </button>
                    </div>

                    {/* Filters section */}
                    <div className={styles.filters_section}>
                        <span className={styles.filters_label}>Filter by element:</span>
                        <div className={styles.filters_list}>
                            {FILTER_ORDER.map((element) => (
                                <label key={element} className={styles.filter_item}>
                                    <input
                                        type="checkbox"
                                        checked={searchFilters.has(element)}
                                        onChange={() => toggleFilter(element)}
                                        className={styles.filter_checkbox}
                                    />
                                    <span className={styles.filter_label}>{FILTER_LABELS[element]}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScreenplaySearch;
