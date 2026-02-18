"use client";

import { useContext, useState, useRef, useEffect, useCallback } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { ScreenplayElement, TitlePageElement, Style } from "@src/lib/utils/enums";
import { applyElement, applyMarkToggle } from "@src/lib/screenplay/editor";
import { applyTitlePageElement, applyTitlePageMarkToggle } from "@src/lib/titlepage/editor";
import { join } from "@src/lib/utils/misc";
import { Bold, Italic, Underline, ChevronDown, AlignLeft, AlignCenter, AlignRight } from "lucide-react";

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

const TITLEPAGE_ELEMENT_LABELS: Record<TitlePageElement, string> = {
    [TitlePageElement.Title]: "Title",
    [TitlePageElement.Author]: "Author",
    [TitlePageElement.Date]: "Date",
    [TitlePageElement.None]: "None",
};

const TITLEPAGE_ELEMENTS_ORDER: TitlePageElement[] = [
    TitlePageElement.Title,
    TitlePageElement.Author,
    TitlePageElement.Date,
    TitlePageElement.None,
];

const ScreenplayFormatDropdown = () => {
    const {
        editor,
        selectedElement,
        setSelectedElement,
        selectedStyles,
        setSelectedStyles,
        titlePageEditor,
        selectedTitlePageElement,
        setSelectedTitlePageElement,
        focusedEditorType,
    } = useContext(ProjectContext);

    const [isOpen, setIsOpen] = useState(false);
    const [selectedAlign, setSelectedAlign] = useState<string>("left");
    const dropdownRef = useRef<HTMLDivElement>(null);

    const isTitleContext = focusedEditorType === "title";

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
        (element: ScreenplayElement | TitlePageElement) => {
            if (isTitleContext) {
                setSelectedTitlePageElement(element as TitlePageElement);
                if (titlePageEditor) applyTitlePageElement(titlePageEditor, element as TitlePageElement);
            } else {
                setSelectedElement(element as ScreenplayElement);
                if (editor) applyElement(editor, element as ScreenplayElement);
            }
            setIsOpen(false);
        },
        [isTitleContext, editor, titlePageEditor, setSelectedElement, setSelectedTitlePageElement],
    );

    const toggleStyle = useCallback(
        (style: Style) => {
            setSelectedStyles((prev) => (prev ^ style) as Style);
            if (isTitleContext && titlePageEditor) {
                applyTitlePageMarkToggle(titlePageEditor, style);
            } else if (editor) {
                applyMarkToggle(editor, style);
            }
        },
        [isTitleContext, editor, titlePageEditor, setSelectedStyles],
    );

    const getActiveStyleClass = (style: Style) => (selectedStyles & style ? styles.active_style : "");

    // Sync alignment state from active editor on selection/content changes
    useEffect(() => {
        const activeEditor = isTitleContext ? titlePageEditor : editor;
        if (!activeEditor) return;

        const updateAlign = () => {
            const align = activeEditor.state.selection.$anchor.parent.attrs.textAlign || "left";
            setSelectedAlign(align);
        };

        activeEditor.on("selectionUpdate", updateAlign);
        activeEditor.on("transaction", updateAlign);
        updateAlign();

        return () => {
            activeEditor.off("selectionUpdate", updateAlign);
            activeEditor.off("transaction", updateAlign);
        };
    }, [isTitleContext, titlePageEditor, editor]);

    const setAlignment = useCallback(
        (align: string) => {
            setSelectedAlign(align);
            if (isTitleContext) {
                if (!titlePageEditor) return;
                titlePageEditor.chain().focus().updateAttributes("tp-text", { textAlign: align }).run();
            } else {
                if (!editor) return;
                const nodeType = editor.state.selection.$anchor.parent.type.name;
                editor.chain().focus().updateAttributes(nodeType, { textAlign: align === "left" ? null : align }).run();
            }
        },
        [isTitleContext, titlePageEditor, editor],
    );

    // Resolve which labels, order, and selected element to display
    const activeLabels = isTitleContext ? TITLEPAGE_ELEMENT_LABELS : ELEMENT_LABELS;
    const activeOrder = isTitleContext ? TITLEPAGE_ELEMENTS_ORDER : ELEMENTS_ORDER;
    const activeSelected = isTitleContext ? selectedTitlePageElement : selectedElement;

    const currentAlign = selectedAlign;

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

            {/* Alignment buttons */}
            <div className={styles.separator} />
            <div className={styles.style_btns}>
                <div
                    className={join(styles.style_btn, currentAlign === "left" ? styles.active_style : "")}
                    onClick={() => setAlignment("left")}
                >
                    <AlignLeft size={16} />
                </div>
                <div
                    className={join(styles.style_btn, currentAlign === "center" ? styles.active_style : "")}
                    onClick={() => setAlignment("center")}
                >
                    <AlignCenter size={16} />
                </div>
                <div
                    className={join(styles.style_btn, currentAlign === "right" ? styles.active_style : "")}
                    onClick={() => setAlignment("right")}
                >
                    <AlignRight size={16} />
                </div>
            </div>

            <div className={styles.separator} />

            {/* Element dropdown */}
            <div className={styles.dropdown_wrapper}>
                <button className={styles.dropdown_trigger} onClick={() => setIsOpen(!isOpen)}>
                    <span className={styles.selected_label}>
                        {activeLabels[activeSelected as keyof typeof activeLabels]}
                    </span>
                    <ChevronDown size={16} className={`${styles.chevron} ${isOpen && styles.chevron_open}`} />
                </button>

                {isOpen && (
                    <div className={styles.dropdown_menu}>
                        {activeOrder.map((element) => (
                            <button
                                key={element}
                                className={`${styles.dropdown_item}
                                    ${element === activeSelected && styles.dropdown_item_active}
                                `}
                                onClick={() => handleElementSelect(element)}
                            >
                                {activeLabels[element as keyof typeof activeLabels]}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ScreenplayFormatDropdown;
