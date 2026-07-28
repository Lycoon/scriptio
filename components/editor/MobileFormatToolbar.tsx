"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronUp, Italic, Underline } from "lucide-react";

import { ProjectContext } from "@src/context/ProjectContext";
import { useIsTouch, useKeyboardInset } from "@src/lib/utils/hooks";
import { applyElement, applyMarkToggle } from "@src/lib/screenplay/editor";
import { applyTitlePageElement, applyTitlePageMarkToggle } from "@src/lib/titlepage/editor";
import { ScreenplayElement, Style, TitlePageElement } from "@src/lib/utils/enums";
import { join } from "@src/lib/utils/misc";

import styles from "./MobileFormatToolbar.module.css";

// Movement (px) past which a pointer gesture on a toolbar button counts as a
// scroll of the button row rather than a tap, so it toggles nothing (see endTap).
const TAP_SLOP = 8;

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
 * Touch-device formatting bar that rides just above the on-screen keyboard while
 * a screenplay/title editor is focused. Surfaces the element-type selector (moved
 * here from the navbar so it's within thumb reach while writing) plus the inline
 * styling (bold, italic, underline) and alignment controls.
 *
 * Gated on the pointer type rather than the phone width so tablets get it too —
 * an iPad writing with the on-screen keyboard needs the element picker in thumb
 * reach just as much as a phone does. The keyboard-inset check below keeps it out
 * of the way when a hardware keyboard is attached (no inset, so nothing renders).
 */
const MobileFormatToolbar = () => {
    const t = useTranslations("formatDropdown");
    const isTouch = useIsTouch();
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

    const keyboardInset = useKeyboardInset(isTouch);

    const isTitleContext = focusedEditorType === "title";
    const isDraftContext = focusedEditorType === "draft";
    const activeEditor = isTitleContext ? titlePageEditor : isDraftContext ? draftEditor : editor;

    const [selectedAlign, setSelectedAlign] = useState<string>("left");
    // Whether the target editor's contenteditable is actually focused. The keyboard
    // being up isn't enough: opening the screenplay search focuses a plain <input>
    // (its own keyboard), and focusedEditorType is never cleared on blur — without
    // this the toolbar would wrongly ride the search keyboard too.
    const [editorFocused, setEditorFocused] = useState(false);
    const [elementMenuOpen, setElementMenuOpen] = useState(false);
    // Briefly true right after picking an element: shields the editor from the tap
    // iOS synthesizes at touch-end so the caret can't jump to the tapped position.
    const [tapGuard, setTapGuard] = useState(false);
    const tapGuardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    // Down-point of an in-progress tap on a style/alignment button, used to tell a
    // tap from a sideways scroll of the button row (see startTap / endTap).
    const tapStart = useRef<{ x: number; y: number } | null>(null);

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

    // Track real focus of the target editor so the toolbar only rides ITS keyboard,
    // not the search input's (see editorFocused above).
    useEffect(() => {
        if (!activeEditor) {
            setEditorFocused(false);
            return;
        }
        const onFocus = () => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            setEditorFocused(true);
        };
        // Defer acting on a blur: an editor mutation (e.g. a mark toggle) can blur
        // and immediately re-focus within a tick, and we don't want that transient
        // to tear the toolbar down. A real blur (tapping the search field, dismissing
        // the keyboard) stays blurred past the grace window and then hides it.
        const onBlur = () => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            blurTimer.current = setTimeout(() => setEditorFocused(false), 150);
        };
        activeEditor.on("focus", onFocus);
        activeEditor.on("blur", onBlur);
        setEditorFocused(activeEditor.isFocused);
        return () => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            activeEditor.off("focus", onFocus);
            activeEditor.off("blur", onBlur);
        };
    }, [activeEditor]);

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

    // Close the element menu only when the pointer-down lands outside the whole
    // toolbar. Taps on the style/alignment controls (which sit outside the element
    // wrapper but inside the bar) must not dismiss the menu. Scoping to the toolbar
    // also means these taps never steal the editor focus / drop the keyboard.
    useEffect(() => {
        if (!elementMenuOpen) return;
        const onDown = (e: PointerEvent) => {
            if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
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
            // refocus: false — the editor is already focused here; a programmatic
            // re-focus drops the iOS keyboard on the mark-removal path (see
            // applyMarkToggle).
            if (isTitleContext) {
                applyTitlePageMarkToggle(activeEditor, style, false);
            } else {
                applyMarkToggle(activeEditor, style, false);
            }
        },
        [activeEditor, isTitleContext, isReadOnly, setSelectedStyles],
    );

    const selectElement = useCallback(
        (element: ScreenplayElement | TitlePageElement) => {
            // Close the menu immediately, then raise the tap-guard: iOS fires a
            // synthesized mousedown at touch-end, and once the menu item unmounts
            // that tap falls through to the editor behind it and moves the caret.
            // The guard (see render) covers the editor for a beat to absorb it.
            setElementMenuOpen(false);
            if (isReadOnly || !activeEditor) return;
            if (isTitleContext) {
                setSelectedTitlePageElement(element as TitlePageElement);
                applyTitlePageElement(activeEditor, element as TitlePageElement);
            } else {
                setSelectedElement(element as ScreenplayElement);
                applyElement(activeEditor, element as ScreenplayElement);
            }
            setTapGuard(true);
            if (tapGuardTimer.current) clearTimeout(tapGuardTimer.current);
            tapGuardTimer.current = setTimeout(() => setTapGuard(false), 350);
        },
        [activeEditor, isTitleContext, isReadOnly, setSelectedElement, setSelectedTitlePageElement],
    );

    // Drop the tap-guard timer if the toolbar unmounts mid-gesture.
    useEffect(() => () => {
        if (tapGuardTimer.current) clearTimeout(tapGuardTimer.current);
    }, []);

    const setAlignment = useCallback(
        (align: string) => {
            if (isReadOnly || !activeEditor) return;
            setSelectedAlign(align);
            // No .focus(): the editor is already focused, and re-focusing risks
            // dropping the iOS keyboard (see applyMarkToggle / toggleStyle).
            if (isTitleContext) {
                activeEditor.chain().updateAttributes("tp-text", { textAlign: align }).run();
            } else {
                const nodeType = activeEditor.state.selection.$anchor.parent.type.name;
                activeEditor
                    .chain()
                    .updateAttributes(nodeType, { textAlign: align === "left" ? null : align })
                    .run();
            }
        },
        [activeEditor, isTitleContext, isReadOnly],
    );

    // Only mount on a touch device, once the target editor itself is focused and the
    // on-screen keyboard is up. editorFocused excludes the case where another field
    // (e.g. search) holds focus while a stale focusedEditorType lingers.
    const isVisible =
        isTouch && keyboardInset > 0 && !!activeEditor && focusedEditorType !== null && editorFocused;
    if (!isVisible) return null;

    // Fire on pointer-down and swallow the event so focus (and the on-screen
    // keyboard) stays on the editor — a normal click would blur it first. Stopping
    // propagation also keeps the tap from reaching the editor as a caret move.
    // Used by the element trigger and menu items, which don't live in a scroller.
    const action = (fn: () => void) => (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
    };

    // The style/alignment buttons sit in a horizontally scrollable row, so they
    // can't fire on pointer-down: a scroll that starts on a button would toggle it.
    // Record the down point (startTap) and only act on pointer-up when the pointer
    // barely moved (endTap); a drag past the slop — or the pointercancel iOS fires
    // once it claims the gesture for scrolling (cancelTap) — toggles nothing. Focus
    // is held by the toolbar's onMouseDown, not by acting on pointer-down.
    const startTap = (e: React.PointerEvent) => {
        tapStart.current = { x: e.clientX, y: e.clientY };
    };
    const endTap = (fn: () => void) => (e: React.PointerEvent) => {
        const start = tapStart.current;
        tapStart.current = null;
        if (!start) return;
        if (Math.abs(e.clientX - start.x) > TAP_SLOP || Math.abs(e.clientY - start.y) > TAP_SLOP) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        fn();
    };
    const cancelTap = () => {
        tapStart.current = null;
    };

    const styleBtn = (active: boolean) => join(styles.btn, active ? styles.active : "");

    return (
        <>
            {/* Transparent shield raised for a beat after an element pick: it sits
                over the editor (below the toolbar) so the tap iOS synthesizes at
                touch-end lands here and is swallowed, never reaching the editor. */}
            {tapGuard && (
                <div className={styles.tap_guard} onPointerDown={(e) => e.preventDefault()} />
            )}
            <div
                className={styles.toolbar}
                style={{ bottom: keyboardInset }}
                role="toolbar"
                ref={toolbarRef}
                // Keep the editor focused for EVERY tap in the bar. After the pointer
                // events iOS fires a compat mousedown whose default blurs the
                // contenteditable; the per-control pointerdown preventDefault doesn't
                // suppress it. Most controls run an editor command that re-asserts the
                // DOM selection and masks the blur, but that reclaim is unreliable on
                // the mark-removal path (and absent on the element trigger), randomly
                // dropping the keyboard and tearing the bar down. Preventing the
                // mousedown default here stops the blur at the source for all of them.
                onMouseDown={(e) => e.preventDefault()}
            >
                {/* Element-type selector — the primary control, opens a menu upward. */}
                <div className={styles.element}>
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
                            onPointerDown={startTap}
                            onPointerUp={endTap(() => toggleStyle(Style.Bold))}
                            onPointerCancel={cancelTap}
                        >
                            <Bold size={18} strokeWidth={3} />
                        </button>
                        <button
                            type="button"
                            aria-label="Italic"
                            aria-pressed={!!(selectedStyles & Style.Italic)}
                            className={styleBtn(!!(selectedStyles & Style.Italic))}
                            onPointerDown={startTap}
                            onPointerUp={endTap(() => toggleStyle(Style.Italic))}
                            onPointerCancel={cancelTap}
                        >
                            <Italic size={18} strokeWidth={2.5} />
                        </button>
                        <button
                            type="button"
                            aria-label="Underline"
                            aria-pressed={!!(selectedStyles & Style.Underline)}
                            className={styleBtn(!!(selectedStyles & Style.Underline))}
                            onPointerDown={startTap}
                            onPointerUp={endTap(() => toggleStyle(Style.Underline))}
                            onPointerCancel={cancelTap}
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
                            onPointerDown={startTap}
                            onPointerUp={endTap(() => setAlignment("left"))}
                            onPointerCancel={cancelTap}
                        >
                            <AlignLeft size={18} />
                        </button>
                        <button
                            type="button"
                            aria-label="Align center"
                            aria-pressed={selectedAlign === "center"}
                            className={styleBtn(selectedAlign === "center")}
                            onPointerDown={startTap}
                            onPointerUp={endTap(() => setAlignment("center"))}
                            onPointerCancel={cancelTap}
                        >
                            <AlignCenter size={18} />
                        </button>
                        <button
                            type="button"
                            aria-label="Align right"
                            aria-pressed={selectedAlign === "right"}
                            className={styleBtn(selectedAlign === "right")}
                            onPointerDown={startTap}
                            onPointerUp={endTap(() => setAlignment("right"))}
                            onPointerCancel={cancelTap}
                        >
                            <AlignRight size={18} />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default MobileFormatToolbar;
