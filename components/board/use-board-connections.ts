"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Point } from "./board-geometry";
import { BoardCamera } from "./use-board-camera";

/**
 * Linking cards, both ways in: dragging out of a card's corner node (pointer,
 * and its touch equivalent), and the tap-then-tap link tool. Plus the cut tool,
 * which is the same subject from the other end.
 */
export function useBoardConnections(
    camera: BoardCamera,
    arrows: { addArrow: (fromCardId: string, toCardId: string) => void; removeArrow: (id: string) => void },
) {
    const { toCanvasPoint, captureGestureRect, releaseGestureRect, getGestureRect } = camera;
    const { addArrow, removeArrow } = arrows;

    const [connectingFrom, setConnectingFrom] = useState<{ cardId: string; side: string } | null>(
        null,
    );
    const [connectingLine, setConnectingLine] = useState<Point | null>(null);

    /** Link tool: the card tapped first, waiting for the target tap. */
    const [linkSource, setLinkSource] = useState<string | null>(null);
    // Mirrored into a ref so the card tap handler can stay identity-stable: it is
    // a BoardCard prop, and a callback that changed on every tap would re-render
    // every card on the board (see the memo note at the bottom of BoardCard).
    const linkSourceRef = useRef<string | null>(null);

    const startConnection = useCallback(
        (cardId: string, side: string, initialX: number, initialY: number) => {
            captureGestureRect();
            setConnectingFrom({ cardId, side });
            setConnectingLine({ x: initialX, y: initialY });
        },
        [captureGestureRect],
    );

    const cancelConnection = useCallback(() => {
        setConnectingFrom(null);
        setConnectingLine(null);
    }, []);

    const completeConnection = useCallback(
        (toCardId: string) => {
            if (connectingFrom) addArrow(connectingFrom.cardId, toCardId);
            cancelConnection();
        },
        [connectingFrom, addArrow, cancelConnection],
    );

    // Track the pointer/finger while a connection is being dragged out.
    useEffect(() => {
        if (!connectingFrom) return;

        const trackTo = (clientX: number, clientY: number) => {
            if (!getGestureRect()) return;
            setConnectingLine(toCanvasPoint(clientX, clientY));
        };

        const onMouseMove = (e: MouseEvent) => trackTo(e.clientX, e.clientY);
        const onTouchMove = (e: TouchEvent) => {
            const touch = e.touches[0];
            if (touch) trackTo(touch.clientX, touch.clientY);
        };
        // Read from the release point itself, not from the last point touchmove
        // happened to report: a connection begun and let go without the finger
        // moving fires no touchmove at all, and resolving a stale point drops the
        // link on whatever card sat under the *previous* gesture's endpoint.
        const onTouchEnd = (e: TouchEvent) => {
            const touch = e.changedTouches[0];
            if (!touch) return cancelConnection();
            const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
            const targetId = el?.closest("[data-card-id]")?.getAttribute("data-card-id");
            if (targetId) completeConnection(targetId);
            else cancelConnection();
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", cancelConnection);
        window.addEventListener("touchmove", onTouchMove, { passive: true });
        window.addEventListener("touchend", onTouchEnd);

        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", cancelConnection);
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("touchend", onTouchEnd);
            releaseGestureRect();
        };
    }, [
        connectingFrom,
        completeConnection,
        cancelConnection,
        toCanvasPoint,
        getGestureRect,
        releaseGestureRect,
    ]);

    const clearLinkSource = useCallback(() => {
        linkSourceRef.current = null;
        setLinkSource(null);
    }, []);

    /**
     * A tap on a card with the link tool armed. The first tap picks the source,
     * the second draws the arrow to it; tapping the source again lets go of it.
     * The tool stays armed after a link lands, so building a chain is one
     * uninterrupted run of taps rather than a round trip to the toolbar each time.
     */
    const handleLinkTap = useCallback(
        (cardId: string) => {
            const source = linkSourceRef.current;
            if (!source) {
                linkSourceRef.current = cardId;
                setLinkSource(cardId);
                return;
            }
            if (source !== cardId) addArrow(source, cardId);
            clearLinkSource();
        },
        [addArrow, clearLinkSource],
    );

    /**
     * Cut whatever link lies under a viewport point, if any.
     *
     * Hit-testing through `elementFromPoint` reuses the arrows' own hitbox
     * strokes — widened while the tool is armed, see .arrow_group_cut — instead
     * of re-deriving every bezier here. Cards render above the arrow layer, so a
     * slash passing over one simply cuts nothing for that stretch, which is the
     * right answer anyway: the link is hidden behind the card there.
     */
    const cutArrowAt = useCallback(
        (clientX: number, clientY: number) => {
            const el = document.elementFromPoint(clientX, clientY);
            const id = el?.closest("[data-arrow-id]")?.getAttribute("data-arrow-id");
            if (id) removeArrow(id);
        },
        [removeArrow],
    );

    return {
        connectingFrom,
        connectingLine,
        startConnection,
        completeConnection,
        linkSource,
        clearLinkSource,
        handleLinkTap,
        cutArrowAt,
    };
}
