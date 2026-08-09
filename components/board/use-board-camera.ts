"use client";

import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BoardCardData } from "@src/lib/project/project-state";
import { GRID_SIZE, GRID_TILE_QUANTUM } from "./board-constants";
import { fitCameraToCards, Point, zoomAround } from "./board-geometry";

export type BoardCamera = ReturnType<typeof useBoardCamera>;

/**
 * The board's viewport: pan offset, zoom, and every way they change (wheel,
 * buttons, middle-drag, fitting to cards), plus the screen↔canvas conversion
 * everything else on the board goes through.
 */
export function useBoardCamera(containerRef: RefObject<HTMLDivElement | null>) {
    const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const [isPanning, setIsPanning] = useState(false);

    // Mirrors of the state above, so handlers that run many times per frame
    // (gestures, global listeners) can read the current camera without being
    // re-created — and re-subscribed — on every frame they cause.
    const offsetRef = useRef(offset);
    const scaleRef = useRef(scale);
    useEffect(() => {
        offsetRef.current = offset;
    }, [offset]);
    useEffect(() => {
        scaleRef.current = scale;
    }, [scale]);

    const getOffset = useCallback(() => offsetRef.current, []);
    const getScale = useCallback(() => scaleRef.current, []);

    const panStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

    /**
     * The container's viewport rect, captured once when a gesture starts.
     *
     * Every move handler needs it to map a pointer to canvas space, but reading
     * it per frame is a `getBoundingClientRect()` on a document the board has
     * just dirtied — a forced synchronous layout of *everything* still on
     * screen (the navigation drawer's scene list, the timeline strip, the
     * parked screenplay editor) on every single move event. The panel itself
     * cannot move mid-gesture, so the rect taken at gesture start stays correct
     * and the whole per-frame relayout goes away.
     */
    const gestureRect = useRef<DOMRect | null>(null);
    const captureGestureRect = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect() ?? null;
        gestureRect.current = rect;
        return rect;
    }, [containerRef]);

    const getGestureRect = useCallback(() => gestureRect.current, []);

    /**
     * Drop the captured rect, so the next gesture measures fresh — the panel may
     * have moved since (a drawer, a split resize).
     */
    const releaseGestureRect = useCallback(() => {
        gestureRect.current = null;
    }, []);

    /**
     * Screen point → canvas point. Uses the gesture's captured rect when there
     * is one, and otherwise measures: the discrete taps that call this outside a
     * gesture (double-tap to create, long-press menu, file drop) are cheap
     * enough to measure fresh, and must not leave a rect behind for the next
     * gesture to trust.
     */
    const toCanvasPoint = useCallback(
        (clientX: number, clientY: number): Point => {
            const rect = gestureRect.current ?? containerRef.current?.getBoundingClientRect();
            if (!rect) return { x: 0, y: 0 };
            return {
                x: (clientX - rect.left - offsetRef.current.x) / scaleRef.current,
                y: (clientY - rect.top - offsetRef.current.y) / scaleRef.current,
            };
        },
        [containerRef],
    );

    /** Frame the given cards, centered, at whatever zoom fits them. */
    const centerCameraOnCards = useCallback(
        (cardsToFit: BoardCardData[]) => {
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const camera = fitCameraToCards(cardsToFit, {
                width: rect.width,
                height: rect.height,
            });
            if (!camera) return;
            setScale(camera.scale);
            setOffset(camera.offset);
        },
        [containerRef],
    );

    const applyZoom = useCallback((anchor: Point, factor: number) => {
        const next = zoomAround(anchor, { offset: offsetRef.current, scale: scaleRef.current }, factor);
        setScale(next.scale);
        setOffset(next.offset);
    }, []);

    // Zoom with the mouse wheel, centered on the cursor. Attached as a native
    // non-passive listener because React registers onWheel as passive, which
    // makes preventDefault() a no-op and warns.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = container.getBoundingClientRect();
            applyZoom({ x: e.clientX - rect.left, y: e.clientY - rect.top }, e.deltaY > 0 ? 0.9 : 1.1);
        };
        container.addEventListener("wheel", onWheel, { passive: false });
        return () => container.removeEventListener("wheel", onWheel);
    }, [containerRef, applyZoom]);

    /** Zoom from the buttons — centered on the viewport. */
    const zoomFromCenter = useCallback(
        (zoomIn: boolean) => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            applyZoom({ x: rect.width / 2, y: rect.height / 2 }, zoomIn ? 1.2 : 0.8);
        },
        [containerRef, applyZoom],
    );

    /** Panning with middle-click. */
    const handlePanMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 1) return;
        e.preventDefault(); // Prevent autoscroll on middle-click

        setIsPanning(true);
        panStart.current = {
            x: e.clientX,
            y: e.clientY,
            offsetX: offsetRef.current.x,
            offsetY: offsetRef.current.y,
        };
    }, []);

    useEffect(() => {
        if (!isPanning) return;

        const onMouseMove = (e: MouseEvent) => {
            setOffset({
                x: panStart.current.offsetX + (e.clientX - panStart.current.x),
                y: panStart.current.offsetY + (e.clientY - panStart.current.y),
            });
        };
        const onMouseUp = () => setIsPanning(false);

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [isPanning]);

    // Grid placement. Pan is expressed purely as a transform, so a pan frame
    // writes nothing but `transform` and the compositor does the rest; the tile
    // size is quantized (see GRID_TILE_QUANTUM) so zoom only touches
    // background-size a handful of times across a gesture, not every frame.
    const gridPattern = useMemo(() => {
        const tile = Math.max(
            GRID_TILE_QUANTUM,
            Math.round((GRID_SIZE * scale) / GRID_TILE_QUANTUM) * GRID_TILE_QUANTUM,
        );
        return {
            backgroundSize: `${tile}px ${tile}px`,
            inset: `${-tile}px`,
            transform: `translate3d(${offset.x % tile}px, ${offset.y % tile}px, 0)`,
        };
    }, [scale, offset]);

    return {
        offset,
        setOffset,
        /** The live camera, for handlers that run between renders. */
        getOffset,
        scale,
        setScale,
        getScale,
        isPanning,
        handlePanMouseDown,
        zoomFromCenter,
        centerCameraOnCards,
        captureGestureRect,
        releaseGestureRect,
        getGestureRect,
        toCanvasPoint,
        gridPattern,
    };
}
