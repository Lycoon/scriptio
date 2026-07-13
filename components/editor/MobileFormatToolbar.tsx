"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronUp, Italic, Underline } from "lucide-react";

import { ProjectContext } from "@src/context/ProjectContext";
import { useIsPhone } from "@src/lib/utils/hooks";
import { applyElement, applyMarkToggle } from "@src/lib/screenplay/editor";
import { applyTitlePageElement, applyTitlePageMarkToggle } from "@src/lib/titlepage/editor";
import { ScreenplayElement, Style, TitlePageElement } from "@src/lib/utils/enums";
import { join } from "@src/lib/utils/misc";

import styles from "./MobileFormatToolbar.module.css";

// Below this the visualViewport shrink is just browser chrome jitter, not an
// open on-screen keyboard.
const KEYBOARD_THRESHOLD = 120;

const SCREENPLAY_ELEMENTS_ORDER: ScreenplayElement[] = [
    ScreenplayElement.Scene,
    ScreenplayElement.Action,
    ScreenplayElement.Character,
    ScreenplayElement.Dialogue,
    ScreenplayElement.Parenthetical,
    ScreenplayElement.Transition,
    ScreenplayElement.Section,
    ScreenplayElement.Note,
];

const TITLEPAGE_ELEMENTS_ORDER: TitlePageElement[] = [
    TitlePageElement.Title,
    TitlePageElement.Author,
    TitlePageElement.Date,
    TitlePageElement.None,
];

/**
 * Distance in px the on-screen keyboard covers at the bottom of the layout
 * viewport, tracked via the VisualViewport API. 0 when no keyboard is up.
 */
const useKeyboardInset = (enabled: boolean): number => {
    const [inset, setInset] = useState(0);

    useEffect(() => {
        // When disabled the consumer is hidden anyway, so leaving a stale inset is
        // harmless — just don't subscribe.
        if (!enabled || typeof window === "undefined" || !window.visualViewport) return;
        const vv = window.visualViewport;
        const update = () => {
            // Layout-viewport height minus the visible visual viewport (and any
            // offset from a scrolled visual viewport) is what the keyboard hides.
            const covered = window.innerHeight - vv.height - vv.offsetTop;
            setInset(covered > KEYBOARD_THRESHOLD ? covered : 0);
        };
        update();
        vv.addEventListener("resize", update);
        vv.addEventListener("scroll", update);
        return () => {
            vv.removeEventListener("resize", update);
            vv.removeEventListener("scroll", update);
        };
    }, [enabled]);

    return inset;
};

/**
 * Phone-only formatting bar that rides just above the on-screen keyboard while a
 * screenplay/title editor is focused. Surfaces the element-type selector (moved
 * here from the navbar so it's within thumb reach while writing) plus the inline
 * styling (bold, italic, underline) and alignment controls.
 */
const MobileFormatToolbar = () => {
    const t = useTranslations("formatDropdown");
    const isPhone = useIsPhone();
    const {
        editor,
        draftEditor,
        titlePageEditor,
        focusedEditorType,
        selectedStyles,
        setSelectedStyles,
        selectedElement,
        setSelectedElement,
        selectedTitlePageElement,
        setSelectedTitlePageElement,
        isReadOnly,
    } = useContext(ProjectContext);

    const keyboardInset = useKeyboardInset(isPhone);

    const isTitleContext = focusedEditorType === "title";
    const isDraftContext = focusedEditorType === "draft";
    const activeEditor = isTitleContext ? titlePageEditor : isDraftContext ? draftEditor : editor;

    const [selectedAlign, setSelectedAlign] = useState<string>("left");
    const [elementMenuOpen, setElementMenuOpen] = useState(false);
    const elementRef = useRef<HTMLDivElement>(null);

    const ELEMENT_LABELS: Record<string, string> = {
        [ScreenplayElement.Scene]: t("elements.scene"),
        [ScreenplayElement.Action]: t("elements.action"),
        [ScreenplayElement.Character]: t("elements.character"),
        [ScreenplayElement.Dialogue]: t("elements.dialogue"),
        [ScreenplayElement.Parenthetical]: t("elements.parenthetical"),
        [ScreenplayElement.Transition]: t("elements.transition"),
        [ScreenplayElement.Section]: t("elements.section"),
        [ScreenplayElement.Note]: t("elements.note"),
        [TitlePageElement.Title]: t("titlePageElements.title"),
        [TitlePageElement.Author]: t("titlePageElements.author"),
        [TitlePageElement.Date]: t("titlePageElements.date"),
        [TitlePageElement.None]: t("titlePageElements.none"),
    };

    const elementOrder = isTitleContext ? TITLEPAGE_ELEMENTS_ORDER : SCREENPLAY_ELEMENTS_ORDER;
    const currentElement = isTitleContext ? selectedTitlePageElement : selectedElement;

    // Keep the alignment highlight in sync with the caret's block.
    useEffect(() => {
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
    }, [activeEditor]);

    // Close the element menu on any pointer-down outside it (without stealing the
    // editor focus the way a normal outside tap would blur it).
    useEffect(() => {
        if (!elementMenuOpen) return;
        const onDown = (e: PointerEvent) => {
            if (elementRef.current && !elementRef.current.contains(e.target as Node)) {
                setElementMenuOpen(false);
            }
        };
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [elementMenuOpen]);

    const toggleStyle = useCallback(
        (style: Style) => {
            if (isReadOnly || !activeEditor) return;
            setSelectedStyles((prev) => (prev ^ style) as Style);
            if (isTitleContext) {
                applyTitlePageMarkToggle(activeEditor, style);
            } else {
                applyMarkToggle(activeEditor, style);
            }
        },
        [activeEditor, isTitleContext, isReadOnly, setSelectedStyles],
    );

    const selectElement = useCallback(
        (element: ScreenplayElement | TitlePageElement) => {
            setElementMenuOpen(false);
            if (isReadOnly || !activeEditor) return;
            if (isTitleContext) {
                setSelectedTitlePageElement(element as TitlePageElement);
                applyTitlePageElement(activeEditor, element as TitlePageElement);
            } else {
                setSelectedElement(element as ScreenplayElement);
                applyElement(activeEditor, element as ScreenplayElement);
            }
        },
        [activeEditor, isTitleContext, isReadOnly, setSelectedElement, setSelectedTitlePageElement],
    );

    const setAlignment = useCallback(
        (align: string) => {
            if (isReadOnly || !activeEditor) return;
            setSelectedAlign(align);
            if (isTitleContext) {
                activeEditor.chain().focus().updateAttributes("tp-text", { textAlign: align }).run();
            } else {
                const nodeType = activeEditor.state.selection.$anchor.parent.type.name;
                activeEditor
                    .chain()
                    .focus()
                    .updateAttributes(nodeType, { textAlign: align === "left" ? null : align })
                    .run();
            }
        },
        [activeEditor, isTitleContext, isReadOnly],
    );

    // Only mount on phone, once a text editor is focused and the keyboard is up.
    const isVisible = isPhone && keyboardInset > 0 && !!activeEditor && focusedEditorType !== null;
    if (!isVisible) return null;

    // Fire on pointer-down and swallow the event so focus (and the on-screen
    // keyboard) stays on the editor — a normal click would blur it first.
    const action = (fn: () => void) => (e: React.PointerEvent) => {
        e.preventDefault();
        fn();
    };

    const styleBtn = (active: boolean) => join(styles.btn, active ? styles.active : "");

    return (
        <div className={styles.toolbar} style={{ bottom: keyboardInset }} role="toolbar">
            {/* Element-type selector — the primary control, opens a menu upward. */}
            <div className={styles.element} ref={elementRef}>
                {elementMenuOpen && (
                    <div className={styles.element_menu}>
                        {elementOrder.map((element) => (
                            <button
                                key={element}
                                type="button"
                                className={join(
                                    styles.element_item,
                                    element === currentElement ? styles.element_item_active : "",
                                )}
                                onPointerDown={action(() => selectElement(element))}
                            >
                                {ELEMENT_LABELS[element]}
                            </button>
                        ))}
                    </div>
                )}
                <button
                    type="button"
                    aria-label="Element type"
                    aria-expanded={elementMenuOpen}
                    className={styles.element_trigger}
                    onPointerDown={action(() => setElementMenuOpen((prev) => !prev))}
                >
                    <span className={styles.element_label}>
                        {ELEMENT_LABELS[currentElement as string] ?? ""}
                    </span>
                    <ChevronUp
                        size={16}
                        className={join(styles.chevron, elementMenuOpen ? styles.chevron_open : "")}
                    />
                </button>
            </div>

            <div className={styles.format_group}>
                <div className={styles.group}>
                    <button
                        type="button"
                        aria-label="Bold"
                        aria-pressed={!!(selectedStyles & Style.Bold)}
                        className={styleBtn(!!(selectedStyles & Style.Bold))}
                        onPointerDown={action(() => toggleStyle(Style.Bold))}
                    >
                        <Bold size={18} strokeWidth={3} />
                    </button>
                    <button
                        type="button"
                        aria-label="Italic"
                        aria-pressed={!!(selectedStyles & Style.Italic)}
                        className={styleBtn(!!(selectedStyles & Style.Italic))}
                        onPointerDown={action(() => toggleStyle(Style.Italic))}
                    >
                        <Italic size={18} strokeWidth={2.5} />
                    </button>
                    <button
                        type="button"
                        aria-label="Underline"
                        aria-pressed={!!(selectedStyles & Style.Underline)}
                        className={styleBtn(!!(selectedStyles & Style.Underline))}
                        onPointerDown={action(() => toggleStyle(Style.Underline))}
                    >
                        <Underline size={18} strokeWidth={2.5} />
                    </button>
                </div>

                <div className={styles.separator} />

                <div className={styles.group}>
                    <button
                        type="button"
                        aria-label="Align left"
                        aria-pressed={selectedAlign === "left"}
                        className={styleBtn(selectedAlign === "left")}
                        onPointerDown={action(() => setAlignment("left"))}
                    >
                        <AlignLeft size={18} />
                    </button>
                    <button
                        type="button"
                        aria-label="Align center"
                        aria-pressed={selectedAlign === "center"}
                        className={styleBtn(selectedAlign === "center")}
                        onPointerDown={action(() => setAlignment("center"))}
                    >
                        <AlignCenter size={18} />
                    </button>
                    <button
                        type="button"
                        aria-label="Align right"
                        aria-pressed={selectedAlign === "right"}
                        className={styleBtn(selectedAlign === "right")}
                        onPointerDown={action(() => setAlignment("right"))}
                    >
                        <AlignRight size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MobileFormatToolbar;
