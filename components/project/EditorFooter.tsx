"use client";

import { useIsPhone, useIsTouch } from "@src/lib/utils/hooks";
import { useActiveEditor } from "@src/lib/editor/use-active-editor";
import EditorFooterActions from "./EditorFooterActions";

import styles from "./EditorFooter.module.css";

/**
 * Subtle status bar at the bottom of the panel area: icon toggles for the view
 * modes (endless scroll, comments, focus mode).
 *
 * Desktop and phone only. A tablet takes the desktop layout but also carries the
 * keyboard toolbar, and an always-open bubble sitting under it is one floating
 * island too many — so there the same controls (see [EditorFooterActions]) hang
 * off that toolbar's burger instead, and this renders nothing at all. Returning
 * null rather than hiding in CSS is what keeps dictation to a single live
 * session: a hidden copy would still be mounted.
 */
const EditorFooter = () => {
    const isPhone = useIsPhone();
    const isTouch = useIsTouch();
    // The footer's toggles all act on the active text editor. Board/statistics
    // panels have none, so on phone (single-panel) the footer is hidden there.
    const activeEditor = useActiveEditor();

    // Tablet: the burger on the keyboard toolbar owns these controls.
    if (isTouch && !isPhone) return null;

    // On phone the workspace is single-panel: hide the footer when the shown
    // panel has no text editor (board, statistics) — its controls don't apply.
    if (isPhone && !activeEditor) return null;

    return (
        <div className={styles.bubble_right}>
            <EditorFooterActions />
        </div>
    );
};

export default EditorFooter;
