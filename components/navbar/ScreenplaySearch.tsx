"use client";

import { useContext, useRef, useEffect, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import { useIsPhone, useKeyboardInset } from "@src/lib/utils/hooks";
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
        // Search is scoped to the focused panel; `editor` here is the active
        // search target (main screenplay, or the focused draft / tree document).
        activeSearchEditor: editor,
        searchTerm,
        setSearchTerm,
        searchFilters,
        setSearchFilters,
        currentSearchIndex,
        setCurrentSearchIndex,
        searchMatches,
    } = useContext(ProjectContext);

    const isPhone = useIsPhone();
    const [isOpen, setIsOpen] = useState(false);
    // Opening the panel focuses its input, which raises the on-screen keyboard.
    // The panel is clamped to the space left above it (see the CSS max-height)
    // so it never extends under the keyboard.
    const keyboardInset = useKeyboardInset(isPhone && isOpen);
    const [replaceValue, setReplaceValue] = useState("");
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
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


    // The match highlights live in the editor, not here, so they outlive this
    // component — clear the term if the field itself goes away mid-search (the
    // phone bar drops search when a board canvas opens). Otherwise the highlights
    // would still be there on returning to the text, with the panel that dismisses
    // them gone. `setSearchTerm` is stable, so this only runs on unmount.
    useEffect(() => {
        return () => setSearchTerm("");
    }, [setSearchTerm]);

    // Focus input when opening
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // When the search target switches panels (focus moved), the new document's
    // matches are a different set — reset navigation so the index stays in range.
    useEffect(() => {
        setCurrentSearchIndex(0);
    }, [editor, setCurrentSearchIndex]);

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

    // Click outside to close — only when the search field is empty. If there's
    // an in-progress search, keep the panel open so it isn't lost on a stray
    // click. Reads the live input value (uncontrolled) rather than the debounced
    // context term so it stays accurate before the debounce fires.
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            // On phone the panel is portaled to <body>, so it's outside containerRef;
            // check it explicitly or a tap on a filter/button would count as "outside".
            if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
                return;
            }
            if (!inputRef.current?.value) {
                handleClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen, handleClose]);

    // iOS scrolls the whole document to bring a focused input into view when the
    // keyboard opens. The app shell is pinned to the viewport (body is
    // overflow: clip) so nothing scrolls the document legitimately — that scroll
    // just drags the entire layout past the top of the screen and leaves it
    // there, taking the navbar with it. Pin it back while the panel is open.
    useEffect(() => {
        if (!isOpen || !isPhone) return;
        const pinToTop = () => {
            if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
        };
        pinToTop();
        window.addEventListener("scroll", pinToTop, { passive: true });
        window.visualViewport?.addEventListener("resize", pinToTop);
        return () => {
            window.removeEventListener("scroll", pinToTop);
            window.visualViewport?.removeEventListener("resize", pinToTop);
        };
    }, [isOpen, isPhone]);

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
            <div className={`${styles.search_wrapper} ${isOpen && !isPhone ? styles.search_wrapper_open : ""}`}>
                {/* On phone the input lives in the panel below (see dropdown) so the
                    expanding field doesn't crush the navbar's format dropdown. */}
                {isOpen && !isPhone && (
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
                    onClick={isOpen ? (isPhone ? handleClose : undefined) : handleOpen}
                >
                    <Search size={18} />
                </div>
            </div>

            {isOpen &&
                (() => {
                    const panel = (
                        <div
                            className={styles.dropdown}
                            ref={dropdownRef}
                            style={{ "--keyboard-inset": `${keyboardInset}px` } as React.CSSProperties}
                        >
                            {isPhone && (
                                <input
                                    ref={inputRef}
                                    type="text"
                                    className={styles.panel_search_input}
                                    placeholder={t("placeholder")}
                                    defaultValue={searchTerm}
                                    onChange={handleSearchChange}
                                />
                            )}

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
                                        ? t("matchCount", {
                                              current: currentSearchIndex + 1,
                                              total: searchMatches.length,
                                          })
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
                                            <span className={styles.filter_label}>
                                                {FILTER_LABELS[element]}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    );
                    // Phone: portal past the navbar, whose transform + overflow:hidden
                    // would otherwise trap and clip this fixed-positioned panel.
                    return isPhone ? createPortal(panel, document.body) : panel;
                })()}
        </div>
    );
};

export default ScreenplaySearch;
