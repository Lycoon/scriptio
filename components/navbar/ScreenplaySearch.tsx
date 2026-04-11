"use client";

import { useContext, useRef, useEffect, useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import { ScreenplayElement } from "@src/lib/utils/enums";
import { scrollToMatch, SearchMatch } from "@src/lib/screenplay/extensions/search-highlight-extension";
import { Search, ChevronUp, ChevronDown, X, Replace, ReplaceAll } from "lucide-react";
import styles from "./ScreenplaySearch.module.css";

const DEBOUNCE_MS = 300;

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
    const t = useTranslations("search");

    const FILTER_LABELS: Record<ScreenplayElement, string> = {
        [ScreenplayElement.Scene]: t("elements.scene"),
        [ScreenplayElement.Action]: t("elements.action"),
        [ScreenplayElement.Character]: t("elements.character"),
        [ScreenplayElement.Dialogue]: t("elements.dialogue"),
        [ScreenplayElement.Parenthetical]: t("elements.parenthetical"),
        [ScreenplayElement.Transition]: t("elements.transition"),
        [ScreenplayElement.Section]: t("elements.section"),
        [ScreenplayElement.Note]: t("elements.note"),
        [ScreenplayElement.DualDialogue]: t("elements.dual_dialogue"),
        [ScreenplayElement.None]: t("elements.none"),
    };

    const {
        editor,
        searchTerm,
        setSearchTerm,
        searchFilters,
        setSearchFilters,
        currentSearchIndex,
        setCurrentSearchIndex,
        searchMatches,
    } = useContext(ProjectContext);

    const [isOpen, setIsOpen] = useState(false);
    const [replaceValue, setReplaceValue] = useState("");
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const replaceInputRef = useRef<HTMLInputElement>(null);

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, []);


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
        setReplaceValue("");
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

    const handleReplace = useCallback(() => {
        if (!editor || searchMatches.length === 0) return;

        const match = searchMatches[currentSearchIndex];
        if (!match) return;

        // Calculate position adjustment for matches after the current one
        const lengthDiff = replaceValue.length - (match.to - match.from);
        const nextMatchIndex = (currentSearchIndex + 1) % searchMatches.length;
        const nextMatch = searchMatches.length > 1 ? searchMatches[nextMatchIndex] : null;

        editor
            .chain()
            .focus()
            .setTextSelection({ from: match.from, to: match.to })
            .insertContent(replaceValue)
            .run();

        // Scroll to next match with adjusted position
        if (nextMatch) {
            const adjustedMatch = nextMatch.from > match.from
                ? { ...nextMatch, from: nextMatch.from + lengthDiff, to: nextMatch.to + lengthDiff }
                : nextMatch;
            scrollToMatch(editor, adjustedMatch);
        }
    }, [editor, searchMatches, currentSearchIndex, replaceValue]);

    const handleReplaceAll = useCallback(() => {
        if (!editor || searchMatches.length === 0) return;

        // Replace from end to start to preserve positions
        const sortedMatches = [...searchMatches].sort((a, b) => b.from - a.from);

        editor.chain().focus();

        // Create a single transaction for all replacements
        const { tr } = editor.state;
        sortedMatches.forEach((match: SearchMatch) => {
            tr.replaceWith(match.from, match.to, editor.state.schema.text(replaceValue));
        });

        editor.view.dispatch(tr);
    }, [editor, searchMatches, replaceValue]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) {
                handleClose();
            }
            if (e.key === "Enter" && isOpen && searchMatches.length > 0) {
                const active = document.activeElement;
                if (active !== inputRef.current && active !== replaceInputRef.current) return;
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
                        placeholder={t("placeholder")}
                        defaultValue={searchTerm}
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
                                ? t("matchCount", { current: currentSearchIndex + 1, total: searchMatches.length })
                                : t("noMatches")}
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

                    {/* Replace section */}
                    <div className={styles.replace_section}>
                        <input
                            ref={replaceInputRef}
                            type="text"
                            className={styles.replace_input}
                            placeholder={t("replacePlaceholder")}
                            value={replaceValue}
                            onChange={(e) => setReplaceValue(e.target.value)}
                        />
                        <div className={styles.replace_actions}>
                            <button
                                className={styles.replace_btn}
                                onClick={handleReplace}
                                disabled={searchMatches.length === 0}
                                title={t("replace")}
                            >
                                <Replace size={16} />
                            </button>
                            <button
                                className={styles.replace_btn}
                                onClick={handleReplaceAll}
                                disabled={searchMatches.length === 0}
                                title={t("replaceAll")}
                            >
                                <ReplaceAll size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Filters section */}
                    <div className={styles.filters_section}>
                        <span className={styles.filters_label}>{t("filterByElement")}</span>
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
