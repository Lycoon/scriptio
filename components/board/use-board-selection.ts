"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BoardCardData } from "@src/lib/project/project-state";
import styles from "./BoardCanvas.module.css";
import { BoardCamera } from "./use-board-camera";

export type SelectionRect = { startX: number; startY: number; endX: number; endY: number };

/** A marquee under this size (canvas px) counts as a click, not a selection. */
const MIN_MARQUEE_SIZE = 5;

/**
 * Multi-selection: the set of selected cards and the left-drag marquee that
 * fills it. Coordinates are canvas-space, so the rectangle keeps its grip on
 * the board if the camera moves mid-drag.
 */
export function useBoardSelection(camera: BoardCamera, getCards: () => BoardCardData[]) {
    const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
    const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
    const isSelecting = useRef(false);

    const clearSelection = useCallback(() => setSelectedCardIds(new Set()), []);

    const { toCanvasPoint, captureGestureRect, releaseGestureRect, getGestureRect } = camera;

    /** Left-click on empty canvas starts a marquee. */
    const handleSelectionMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (e.button !== 0) return;
            const target = e.target as HTMLElement;
            if (
                target.closest(`.${styles.card}`) ||
                target.closest(`.${styles.zoom_controls}`) ||
                target.closest("[data-context-menu]")
            )
                return;

            if (!captureGestureRect()) return;
            const { x, y } = toCanvasPoint(e.clientX, e.clientY);

            isSelecting.current = true;
            setSelectionRect({ startX: x, startY: y, endX: x, endY: y });
            clearSelection();
        },
        [captureGestureRect, toCanvasPoint, clearSelection],
    );

    const isMarqueeActive = selectionRect !== null;
    useEffect(() => {
        if (!isMarqueeActive) return;

        const onMouseMove = (e: MouseEvent) => {
            if (!isSelecting.current || !getGestureRect()) return;
            const { x, y } = toCanvasPoint(e.clientX, e.clientY);
            setSelectionRect((prev) => (prev ? { ...prev, endX: x, endY: y } : null));
        };

        const onMouseUp = () => {
            if (isSelecting.current) {
                setSelectionRect((rect) => {
                    if (rect) selectCardsIn(rect, getCards(), setSelectedCardIds);
                    return null; // Clear the marquee
                });
            } else {
                setSelectionRect(null);
            }
            isSelecting.current = false;
            releaseGestureRect();
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [isMarqueeActive, toCanvasPoint, releaseGestureRect, getGestureRect, getCards]);

    return { selectedCardIds, clearSelection, selectionRect, handleSelectionMouseDown };
}

/** Select every card the marquee touches, unless it is click-sized. */
function selectCardsIn(
    rect: SelectionRect,
    cards: BoardCardData[],
    setSelected: (ids: Set<string>) => void,
) {
    const left = Math.min(rect.startX, rect.endX);
    const top = Math.min(rect.startY, rect.endY);
    const right = Math.max(rect.startX, rect.endX);
    const bottom = Math.max(rect.startY, rect.endY);

    if (right - left <= MIN_MARQUEE_SIZE && bottom - top <= MIN_MARQUEE_SIZE) return;

    const selected = new Set<string>();
    for (const card of cards) {
        if (card.x < right && card.x + card.width > left && card.y < bottom && card.y + card.height > top)
            selected.add(card.id);
    }
    setSelected(selected);
}
