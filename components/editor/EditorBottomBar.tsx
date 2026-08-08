"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Menu } from "lucide-react";

import { useIsPhone, useIsTouch, useViewportBottomInset } from "@src/lib/utils/hooks";
import { KEYBOARD_MIN_HEIGHT } from "@src/lib/editor/visible-band";
import { useActiveEditor } from "@src/lib/editor/use-active-editor";
import { HistoryControls } from "@components/navbar/ProjectNavbarShared";
import EditorFooterActions from "@components/project/EditorFooterActions";
import MobileFormatToolbar from "./MobileFormatToolbar";
import { join } from "@src/lib/utils/misc";

import styles from "./EditorBottomBar.module.css";

/**
 * View-mode toggles behind a burger — endless scroll, spellcheck, dictation, the
 * writing timer. On desktop and phone these sit in an always-open bubble
 * ([EditorFooter]); on a tablet that bubble would be a second floating island
 * stacked under this row, so they hide here instead.
 *
 * The menu is always mounted and only *revealed*: unmounting it would tear down
 * the dictation session it hosts ([EditorFooterActions]) the instant the menu was
 * closed.
 */
const ViewOptionsIsland = () => {
    const t = useTranslations("navbar");
    const [open, setOpen] = useState(false);
    const islandRef = useRef<HTMLDivElement>(null);

    // Dismiss on a tap outside the island. Registered in the *capture* phase so a
    // handler that stops propagation — every control in this row does, to keep the
    // tap off the editor — can't leave the menu stranded open.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            if (islandRef.current && !islandRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("pointerdown", onDown, true);
        return () => document.removeEventListener("pointerdown", onDown, true);
    }, [open]);

    return (
        <div className={styles.side_island} ref={islandRef}>
            <div className={join(styles.footer_menu, open ? styles.footer_menu_open : "")}>
                <EditorFooterActions />
            </div>
            <button
                type="button"
                aria-label={t("menu")}
                aria-expanded={open}
                className={styles.island_btn}
                onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen((prev) => !prev);
                }}
            >
                <Menu size={18} />
            </button>
        </div>
    );
};

/**
 * The row of floating chrome along the bottom of the editor on a touch device:
 * undo/redo on the left, the format pill ([MobileFormatToolbar]) in the middle,
 * the view-mode burger on the right.
 *
 * Owns the positioning for all three. `--vv-inset` is how much an on-screen
 * keyboard covers, so the row rides its top edge; below KEYBOARD_MIN_HEIGHT it is
 * zeroed and the CSS floors the row at its resting height instead. See
 * .bar_row for why that cutoff is not simply "anything at all".
 *
 * Renders on any touch device but the flanking islands are tablet-only: a phone
 * has both elsewhere already — undo/redo in the navbar's edit-mode cluster, the
 * view toggles in the footer bubble — and no width to spare for three islands.
 * With no islands and no pill (nothing focused) the row is an empty, transparent,
 * click-through box, so it costs nothing to leave mounted.
 */
const EditorBottomBar = () => {
    const isTouch = useIsTouch();
    const isPhone = useIsPhone();
    // The editor undo/redo act on. Resolved from the *panel* rather than from
    // focus, because the island stays up while nothing is focused — reading a
    // script and undoing the last edit is a normal thing to do.
    const historyEditor = useActiveEditor();

    // How much is covered at the bottom of the viewport right now. Only a real
    // keyboard is worth riding: dismissing one on an iPad leaves ~173px still
    // reported as covered (the region iOS reserves around its shortcuts bar,
    // nearly all of it empty), and following that parks the row a hand's width off
    // the screen edge with nothing under it.
    const bottomInset = useViewportBottomInset(isTouch);
    const keyboardCover = bottomInset >= KEYBOARD_MIN_HEIGHT ? bottomInset : 0;

    const hasIslands = isTouch && !isPhone;

    if (!isTouch) return null;

    return (
        <div
            className={styles.bar_row}
            // Handed to CSS as a length rather than set as `bottom` outright, so
            // the rule can floor it against the resting height — see .bar_row.
            style={{ "--vv-inset": `${keyboardCover}px` } as React.CSSProperties}
            // Keep the editor focused for EVERY tap in the row, islands included.
            // After the pointer events iOS fires a compat mousedown whose default
            // blurs the contenteditable; the per-control pointerdown preventDefault
            // doesn't suppress it. Most controls run an editor command that
            // re-asserts the DOM selection and masks the blur, but that reclaim is
            // unreliable on the mark-removal path (and absent on the element
            // trigger), randomly dropping the keyboard and tearing the bar down.
            // Preventing the mousedown default here stops the blur at the source
            // for all of them.
            onMouseDown={(e) => e.preventDefault()}
        >
            {/* Undo/redo, outside the pill rather than in it: they act on the
                document as a whole, not on the caret's block, and the pill's width
                is derived from the controls that do (--tb-base-width). */}
            {hasIslands && historyEditor && (
                <div className={styles.side_island}>
                    <HistoryControls editor={historyEditor} className={styles.island_btn} />
                </div>
            )}

            <MobileFormatToolbar />

            {hasIslands && <ViewOptionsIsland />}
        </div>
    );
};

export default EditorBottomBar;
