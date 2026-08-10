"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp } from "lucide-react";

import { useIsPhone, useIsTouch, usePagePanLock, useViewportBottomInset } from "@src/lib/utils/hooks";
import { KEYBOARD_MIN_HEIGHT } from "@src/lib/editor/visible-band";
import { useActiveEditor } from "@src/lib/editor/use-active-editor";
import { useEditorFocused } from "@src/lib/editor/use-editor-focused";
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
 * The menu is only *revealed* on open, never mounted then: unmounting it would
 * tear down the dictation session it hosts ([EditorFooterActions]) the instant
 * the menu was closed. It does go when the whole row goes — see [EditorBottomBar]
 * for when that is — and takes any dictation with it, which is the right end for
 * a session with no focused editor left to dictate into.
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
                {/* Points at what the tap does, not at what is behind the button:
                    the menu opens upward out of this island, so up is "show me"
                    and down is "put it away". A burger here read as one more of
                    the format pill's alignment icons a few centimetres to the
                    left. */}
                {open ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </button>
        </div>
    );
};

/**
 * The row of floating chrome along the bottom of the screen while something is
 * being written on a touch device: undo/redo on the left, the format pill
 * ([MobileFormatToolbar]) in the middle, the view-mode burger on the right.
 *
 * Owns the positioning for all three. `--vv-inset` is how much an on-screen
 * keyboard covers, so the row rides its top edge; below KEYBOARD_MIN_HEIGHT it is
 * zeroed and the CSS floors the row at its resting height instead. See
 * .bar_row for why that cutoff is not simply "anything at all".
 *
 * Present exactly while an editor holds focus, and nothing else. It used to stay
 * mounted throughout and change shape underneath the reader: a lone burger over a
 * board — where every control behind it acts on a text editor that isn't there —
 * then undo/redo added once a panel with an editor was up, then the format pill
 * added again on focus. Three shapes for chrome nobody had asked for yet. Now
 * there is one shape and it means one thing. The price is that undo/redo and the
 * view toggles, which have nowhere else to live on a tablet, want a tap into the
 * script first.
 *
 * The flanking islands stay tablet-only: a phone has both elsewhere already —
 * undo/redo in the navbar's edit-mode cluster, the view toggles in the footer
 * bubble — and no width to spare for three islands.
 */
const EditorBottomBar = () => {
    const isTouch = useIsTouch();
    const isPhone = useIsPhone();
    // The editor being written in, resolved from the *panel* so a split answers
    // with the side holding focus rather than the one that happens to be primary.
    const historyEditor = useActiveEditor();
    // Whether it actually holds focus — which is not the same question as "is the
    // keyboard up": the screenplay search raises one over an <input> of its own,
    // and none of this row applies to that.
    const editorFocused = useEditorFocused(historyEditor);
    // Handed null, that hook keeps reporting whatever it last latched — it has
    // nothing to re-seed from and its consumers all need an editor anyway (see
    // useEditorFocused). Switching to a board is exactly that case, so pair it
    // with the editor still being there or the row survives the switch.
    const isWriting = !!historyEditor && editorFocused;

    // How much is covered at the bottom of the viewport right now. Only a real
    // keyboard is worth riding: dismissing one on an iPad leaves ~173px still
    // reported as covered (the region iOS reserves around its shortcuts bar,
    // nearly all of it empty), and following that parks the row a hand's width off
    // the screen edge with nothing under it.
    const bottomInset = useViewportBottomInset(isTouch);
    const keyboardCover = bottomInset >= KEYBOARD_MIN_HEIGHT ? bottomInset : 0;

    const hasIslands = isTouch && !isPhone;

    // A drag across the row must never pan the page: this bar is fixed chrome, so
    // the pan would carry it off the screen (see usePagePanLock). The pill's own
    // sideways scroll and its upward menus are exempted there.
    const panLockRef = usePagePanLock<HTMLDivElement>();

    if (!isTouch || !isWriting) return null;

    return (
        <div
            ref={panLockRef}
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
