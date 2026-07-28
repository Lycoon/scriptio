"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useViewContext } from "@src/context/ViewContext";
import styles from "./SplitPanelContainer.module.css";

/**
 * Draws the divider between the two split panels and resizes them by dragging.
 *
 * Wired with pointer events rather than mouse events so the same code path
 * serves a mouse, a finger and a pen. The split layout is shown on tablets as
 * well as desktop (see SplitPanelContainer), and on a tablet the divider is the
 * one piece of split-view chrome the user has to be able to grab — under
 * mousedown/mousemove it was inert to touch, leaving the ratio stuck at 50/50.
 * `touch-action: none` on the handle (see the stylesheet) is what stops the
 * browser claiming the drag as a scroll before the first pointermove lands.
 */
const DragHandle = () => {
    const { setSplitRatio } = useViewContext();
    const [isDragging, setIsDragging] = useState(false);
    const gridRef = useRef<HTMLElement | null>(null);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        // Cache the grid container (two levels up: handle → order wrapper → grid)
        const grid = (e.currentTarget as HTMLElement).parentElement?.parentElement;
        if (grid) gridRef.current = grid;
        // Route every subsequent move/up for this pointer here, so a fast drag
        // that outruns the 6px handle doesn't drop the gesture.
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsDragging(true);
    }, []);

    useEffect(() => {
        if (!isDragging) return;

        const handlePointerMove = (e: PointerEvent) => {
            const grid = gridRef.current;
            if (!grid) return;

            const rect = grid.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const ratio = Math.min(0.8, Math.max(0.2, x / rect.width));
            setSplitRatio(ratio);
        };

        const handlePointerUp = () => {
            setIsDragging(false);
        };

        document.addEventListener("pointermove", handlePointerMove);
        document.addEventListener("pointerup", handlePointerUp);
        // A finger drag can be cancelled outright (a system gesture takes over);
        // without this the handle would stay latched to the pointer.
        document.addEventListener("pointercancel", handlePointerUp);

        return () => {
            document.removeEventListener("pointermove", handlePointerMove);
            document.removeEventListener("pointerup", handlePointerUp);
            document.removeEventListener("pointercancel", handlePointerUp);
        };
    }, [isDragging, setSplitRatio]);

    return (
        <>
            <div
                className={`${styles.drag_handle} ${isDragging ? styles.drag_handle_active : ""}`}
                onPointerDown={onPointerDown}
            />
            {isDragging && <div className={styles.drag_overlay} />}
        </>
    );
};

export default DragHandle;
