"use client";

import { useCallback, useEffect, useRef } from "react";
import styles from "./BoardCanvas.module.css";
import { BoardTool } from "./board-constants";
import { clampScale } from "./board-geometry";
import { BoardCamera } from "./use-board-camera";

/** Hold time before a press on empty canvas opens the canvas menu. */
const LONG_PRESS_MS = 500;
/** Window and slop within which two taps count as a double-tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 30;
/** Movement (screen px) that turns a press into a pan. */
const PAN_SLOP = 8;
/** How long after a touch the mouse events WebKit synthesizes keep arriving. */
const SYNTHETIC_MOUSE_MS = 700;

type TouchGesture = {
    mode: "none" | "pan" | "pinch" | "cut";
    startX: number;
    startY: number;
    startOffset: { x: number; y: number };
    startDist: number;
    startScale: number;
    pinchCanvasX: number;
    pinchCanvasY: number;
    moved: boolean;
};

/**
 * Container touch gestures. One finger pans the canvas; two fingers pinch-zoom
 * (centred on the pinch); a double-tap on empty canvas creates a card; a
 * long-press opens the canvas menu. Cards and handles stop propagation, so
 * their touches never reach here.
 */
export function useBoardTouch(options: {
    camera: BoardCamera;
    tool: BoardTool;
    isConnecting: boolean;
    onCutAt: (clientX: number, clientY: number) => void;
    onLongPress: (clientX: number, clientY: number) => void;
    onDoubleTap: (canvasX: number, canvasY: number) => void;
    onCancelLink: () => void;
}) {
    const { camera, tool, isConnecting, onCutAt, onLongPress, onDoubleTap, onCancelLink } = options;
    const { setOffset, setScale, getOffset, getScale, toCanvasPoint } = camera;

    const gesture = useRef<TouchGesture>({
        mode: "none",
        startX: 0,
        startY: 0,
        startOffset: { x: 0, y: 0 },
        startDist: 0,
        startScale: 1,
        pinchCanvasX: 0,
        pinchCanvasY: 0,
        moved: false,
    });
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTap = useRef({ time: 0, x: 0, y: 0 });

    // Timestamp of the most recent touch activity, used to ignore the mouse
    // events WebKit synthesizes at the end of a touch gesture.
    //
    // The mouse handlers stay attached even on touch devices, because an iPad
    // reports `pointer: coarse` whether or not a trackpad is attached — dropping
    // them would leave Magic Keyboard users unable to pan or drag. Without this
    // guard a one-finger pan would also fire the synthesized mousedown and start
    // a marquee selection on top of the pan. Refreshed on every touch event (not
    // just touchstart) so a long drag doesn't age out of the window mid-gesture.
    const lastTouch = useRef(0);
    const isSyntheticMouse = useCallback(
        () => Date.now() - lastTouch.current < SYNTHETIC_MOUSE_MS,
        [],
    );

    const cancelLongPress = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };
    useEffect(() => cancelLongPress, []);

    /** Board chrome and cards handle their own touches — the canvas ignores them. */
    const isChromeTarget = (target: HTMLElement) =>
        !!(
            target.closest(`.${styles.card}`) ||
            target.closest(`.${styles.zoom_controls}`) ||
            target.closest(`.${styles.tool_controls}`) ||
            target.closest(`.${styles.recording_indicator}`) ||
            target.closest("[data-context-menu]")
        );

    const handleTouchStart = (e: React.TouchEvent) => {
        lastTouch.current = Date.now();
        if (isConnecting) return;
        if (isChromeTarget(e.target as HTMLElement)) return;

        // Cut tool: one finger slashes through links rather than panning. Two
        // still pinch/pan, so the board stays navigable without disarming the
        // tool between cuts.
        if (tool === "cut" && e.touches.length === 1) {
            cancelLongPress();
            gesture.current = { ...gesture.current, mode: "cut", moved: false };
            onCutAt(e.touches[0].clientX, e.touches[0].clientY);
            return;
        }

        if (e.touches.length === 1) {
            const touch = e.touches[0];
            gesture.current = {
                ...gesture.current,
                mode: "pan",
                startX: touch.clientX,
                startY: touch.clientY,
                startOffset: { ...getOffset() },
                moved: false,
            };
            cancelLongPress();
            const pressX = touch.clientX;
            const pressY = touch.clientY;
            longPressTimer.current = setTimeout(() => {
                gesture.current.mode = "none";
                onLongPress(pressX, pressY);
            }, LONG_PRESS_MS);
        } else if (e.touches.length === 2) {
            cancelLongPress();
            camera.captureGestureRect();
            const [a, b] = [e.touches[0], e.touches[1]];
            const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
            const mid = toCanvasPoint((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
            gesture.current = {
                ...gesture.current,
                mode: "pinch",
                startDist: dist || 1,
                startScale: getScale(),
                pinchCanvasX: mid.x,
                pinchCanvasY: mid.y,
                moved: true,
            };
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        lastTouch.current = Date.now();
        const g = gesture.current;

        if (g.mode === "cut" && e.touches.length === 1) {
            // Sampled per move event, so a fast flick can step over a link
            // between frames — the deliberate stroke the tool asks for lands
            // every time, and a stationary tap cuts on touchstart regardless.
            onCutAt(e.touches[0].clientX, e.touches[0].clientY);
        } else if (g.mode === "pan" && e.touches.length === 1) {
            const touch = e.touches[0];
            const dx = touch.clientX - g.startX;
            const dy = touch.clientY - g.startY;
            if (!g.moved && Math.hypot(dx, dy) > PAN_SLOP) {
                g.moved = true;
                cancelLongPress();
            }
            if (g.moved) setOffset({ x: g.startOffset.x + dx, y: g.startOffset.y + dy });
        } else if (g.mode === "pinch" && e.touches.length >= 2) {
            const rect = camera.getGestureRect();
            if (!rect) return;
            const [a, b] = [e.touches[0], e.touches[1]];
            const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
            const midX = (a.clientX + b.clientX) / 2;
            const midY = (a.clientY + b.clientY) / 2;
            const newScale = clampScale(g.startScale * (dist / g.startDist));
            setScale(newScale);
            setOffset({
                x: midX - rect.left - g.pinchCanvasX * newScale,
                y: midY - rect.top - g.pinchCanvasY * newScale,
            });
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        lastTouch.current = Date.now();
        cancelLongPress();
        const g = gesture.current;
        const isTap = g.mode === "pan" && !g.moved;

        // A tap on empty canvas with the link tool armed drops the pending source
        // instead of creating a card — double-tap-to-create belongs to the plain
        // board, and reaching for it mid-link is far more likely to be a miss.
        if (tool === "link" && isTap) {
            onCancelLink();
        } else if (isTap && e.changedTouches.length > 0) {
            const touch = e.changedTouches[0];
            const now = Date.now();
            const isDoubleTap =
                now - lastTap.current.time < DOUBLE_TAP_MS &&
                Math.hypot(touch.clientX - lastTap.current.x, touch.clientY - lastTap.current.y) <
                    DOUBLE_TAP_SLOP;
            if (isDoubleTap) {
                const point = toCanvasPoint(touch.clientX, touch.clientY);
                onDoubleTap(point.x, point.y);
                lastTap.current = { time: 0, x: 0, y: 0 };
            } else {
                lastTap.current = { time: now, x: touch.clientX, y: touch.clientY };
            }
        }

        if (e.touches.length === 0) {
            g.mode = "none";
            camera.releaseGestureRect();
        } else if (e.touches.length === 1) {
            // A finger lifted from a pinch — resume panning with the one that remains.
            const touch = e.touches[0];
            gesture.current = {
                ...g,
                mode: "pan",
                startX: touch.clientX,
                startY: touch.clientY,
                startOffset: { ...getOffset() },
                moved: true,
            };
        }
    };

    return { handleTouchStart, handleTouchMove, handleTouchEnd, isSyntheticMouse };
}
