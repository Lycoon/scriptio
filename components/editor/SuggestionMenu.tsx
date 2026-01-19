"use client";

import { useContext, useEffect, useState, useCallback, useRef } from "react";

import styles from "./SuggestionMenu.module.css";
import { pasteTextAt } from "@src/lib/screenplay/editor";
import { ProjectContext } from "@src/context/ProjectContext";

type Props = {
    suggestions: string[];
    suggestionData: SuggestionData;
    onSelect?: () => void;
};

type Position = {
    x: number;
    y: number;
};

export type SuggestionData = {
    position: Position;
    cursor: number;
    cursorInNode: number;
    /** Offset within the node where the replaceable text starts (e.g., after "INT. " prefix) */
    textOffset?: number;
};

const SuggestionMenu = ({ suggestionData, suggestions, onSelect }: Props) => {
    const [selectedIdx, setSelectedIdx] = useState(0);
    const { editor } = useContext(ProjectContext);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

    // Use refs to avoid stale closure issues
    const selectedIdxRef = useRef(selectedIdx);
    const suggestionDataRef = useRef(suggestionData);
    const suggestionsRef = useRef(suggestions);

    // Keep refs in sync
    useEffect(() => {
        selectedIdxRef.current = selectedIdx;
    }, [selectedIdx]);

    useEffect(() => {
        suggestionDataRef.current = suggestionData;
    }, [suggestionData]);

    useEffect(() => {
        suggestionsRef.current = suggestions;
    }, [suggestions]);

    // Reset selection when suggestions change
    useEffect(() => {
        setSelectedIdx(0);
        itemRefs.current = [];
    }, [suggestions]);

    // Scroll selected item into view
    useEffect(() => {
        const selectedItem = itemRefs.current[selectedIdx];
        if (selectedItem) {
            selectedItem.scrollIntoView({ block: "nearest" });
        }
    }, [selectedIdx]);

    const selectSuggestion = useCallback(
        (idx: number) => {
            if (!editor) return;

            const data = suggestionDataRef.current;
            const currentSuggestions = suggestionsRef.current;

            // Calculate how much of the suggestion to insert
            // textOffset indicates where the replaceable portion starts (e.g., after "INT. ")
            const offset = data.textOffset ?? 0;
            const typedLength = data.cursorInNode - offset;
            const suggestion = currentSuggestions[idx]?.slice(typedLength);
            if (suggestion) {
                pasteTextAt(editor, suggestion, data.cursor);
                onSelect?.();
            }
        },
        [editor, onSelect]
    );

    useEffect(() => {
        const len = suggestions.length;
        if (len === 0) return;

        const pressedKeyEvent = (e: KeyboardEvent) => {
            if (e.key === "ArrowUp") {
                e.preventDefault();
                e.stopImmediatePropagation();
                setSelectedIdx((prev) => (prev + len - 1) % len);
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                e.stopImmediatePropagation();
                setSelectedIdx((prev) => (prev + 1) % len);
            } else if (e.key === "Enter") {
                e.preventDefault();
                e.stopImmediatePropagation();
                selectSuggestion(selectedIdxRef.current);
            }
        };

        // Use capture phase to intercept before editor
        document.addEventListener("keydown", pressedKeyEvent, true);
        return () => {
            document.removeEventListener("keydown", pressedKeyEvent, true);
        };
    }, [suggestions.length, selectSuggestion]);

    return (
        <div
            className={styles.menu}
            style={{
                top: suggestionData.position.y + 20,
                left: suggestionData.position.x,
            }}
        >
            {suggestions.map((suggestion: string, index: number) => (
                <div
                    ref={(el) => {
                        itemRefs.current[index] = el;
                    }}
                    className={`${styles.menu_item} ${index === selectedIdx ? styles.selected : ""}`}
                    onClick={() => selectSuggestion(index)}
                    key={index}
                >
                    <p className={styles.item + " unselectable"}>{suggestion}</p>
                </div>
            ))}
        </div>
    );
};

export default SuggestionMenu;
