"use client";

import { useContext, useState, useRef, useEffect, useCallback } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { ScreenplayElement, Style } from "@src/lib/utils/enums";
import { applyElement, applyMarkToggle } from "@src/lib/screenplay/editor";
import { join } from "@src/lib/utils/misc";
import { Bold, Italic, Underline, ChevronDown } from "lucide-react";

import styles from "./ScreenplayFormatDropdown.module.css";

const ELEMENT_LABELS: Record<ScreenplayElement, string> = {
    [ScreenplayElement.Scene]: "SCENE HEADING",
    [ScreenplayElement.Action]: "Action",
    [ScreenplayElement.Character]: "CHARACTER",
    [ScreenplayElement.Dialogue]: "Dialogue",
    [ScreenplayElement.Parenthetical]: "(Parenthetical)",
    [ScreenplayElement.Transition]: "TRANSITION:",
    [ScreenplayElement.Section]: "Section",
    [ScreenplayElement.Note]: "[[Note]]",
    [ScreenplayElement.None]: "None",
};

const ELEMENTS_ORDER: ScreenplayElement[] = [
    ScreenplayElement.Scene,
    ScreenplayElement.Action,
    ScreenplayElement.Character,
    ScreenplayElement.Dialogue,
    ScreenplayElement.Parenthetical,
    ScreenplayElement.Transition,
    ScreenplayElement.Section,
    ScreenplayElement.Note,
];

const ScreenplayFormatDropdown = () => {
    const { editor, selectedElement, setSelectedElement, selectedStyles, setSelectedStyles } =
        useContext(ProjectContext);
    const [isOpen, setIsOpen] = useState(false);
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

    const handleElementSelect = useCallback(
        (element: ScreenplayElement) => {
            setSelectedElement(element);
            if (editor) applyElement(editor, element);
            setIsOpen(false);
        },
        [editor, setSelectedElement]
    );

    const toggleStyle = useCallback(
        (style: Style) => {
            setSelectedStyles((prev) => prev ^ style);
            if (editor) applyMarkToggle(editor, style);
        },
        [editor, setSelectedStyles]
    );

    const getActiveStyleClass = (style: Style) => (selectedStyles & style ? styles.active_style : "");

    return (
        <div className={styles.container} ref={dropdownRef}>
            {/* Style buttons */}
            <div className={styles.style_btns}>
                <div
                    className={join(styles.style_btn, getActiveStyleClass(Style.Bold))}
                    onClick={() => toggleStyle(Style.Bold)}
                >
                    <Bold size={16} strokeWidth={3} />
                </div>
                <div
                    className={join(styles.style_btn, getActiveStyleClass(Style.Italic))}
                    onClick={() => toggleStyle(Style.Italic)}
                >
                    <Italic size={16} strokeWidth={2.5} />
                </div>
                <div
                    className={join(styles.style_btn, getActiveStyleClass(Style.Underline))}
                    onClick={() => toggleStyle(Style.Underline)}
                >
                    <Underline size={16} strokeWidth={2.5} />
                </div>
            </div>

            <div className={styles.separator} />

            {/* Element dropdown */}
            <div className={styles.dropdown_wrapper}>
                <button className={styles.dropdown_trigger} onClick={() => setIsOpen(!isOpen)}>
                    <span className={styles.selected_label}>{ELEMENT_LABELS[selectedElement]}</span>
                    <ChevronDown size={16} className={join(styles.chevron, isOpen && styles.chevron_open)} />
                </button>

                {isOpen && (
                    <div className={styles.dropdown_menu}>
                        {ELEMENTS_ORDER.map((element) => (
                            <button
                                key={element}
                                className={join(
                                    styles.dropdown_item,
                                    element === selectedElement && styles.dropdown_item_active
                                )}
                                onClick={() => handleElementSelect(element)}
                            >
                                {ELEMENT_LABELS[element]}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ScreenplayFormatDropdown;
