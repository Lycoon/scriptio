"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Underline } from "lucide-react";

import { ProjectContext } from "@src/context/ProjectContext";
import { useIsPhone } from "@src/lib/utils/hooks";
import { applyMarkToggle } from "@src/lib/screenplay/editor";
import { applyTitlePageMarkToggle } from "@src/lib/titlepage/editor";
import { Style } from "@src/lib/utils/enums";
import { join } from "@src/lib/utils/misc";

import styles from "./MobileFormatToolbar.module.css";

// Below this the visualViewport shrink is just browser chrome jitter, not an
// open on-screen keyboard.
const KEYBOARD_THRESHOLD = 120;

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
 * screenplay/title editor is focused. Surfaces the inline styling (bold, italic,
 * underline) and alignment controls that are dropped from the narrow navbar
 * (see the max-width:767px block in ScreenplayFormatDropdown.module.css).
 */
const MobileFormatToolbar = () => {
    const isPhone = useIsPhone();
    const {
        editor,
        draftEditor,
        titlePageEditor,
        focusedEditorType,
        selectedStyles,
        setSelectedStyles,
        isReadOnly,
    } = useContext(ProjectContext);

    const keyboardInset = useKeyboardInset(isPhone);

    const isTitleContext = focusedEditorType === "title";
    const isDraftContext = focusedEditorType === "draft";
    const activeEditor = isTitleContext ? titlePageEditor : isDraftContext ? draftEditor : editor;

    const [selectedAlign, setSelectedAlign] = useState<string>("left");

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
    );
};

export default MobileFormatToolbar;
