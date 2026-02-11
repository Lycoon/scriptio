"use client";

import { useContext, useRef, useState, useCallback, useEffect, useMemo } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { getBoardMap } from "@src/lib/project/project-state";
import BoardCard, { BoardCardData } from "./BoardCard";
import styles from "./BoardCanvas.module.css";
import { v4 as uuidv4 } from "uuid";
import { Trash2, Plus, Minus, Copy } from "lucide-react";

const GRID_SIZE = 20;
const MIN_SCALE = 0.25;
const MAX_SCALE = 2;

const DEFAULT_CARD_COLORS = [
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#06b6d4",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#6b7280",
];

export interface BoardArrowData {
    id: string;
    fromCardId: string;
    toCardId: string;
}

interface CardContextMenuState {
    position: { x: number; y: number };
    card: BoardCardData;
}

interface ArrowContextMenuState {
    position: { x: number; y: number };
    arrow: BoardArrowData;
}

const BoardCanvas = ({ isVisible }: { isVisible: boolean }) => {
    const { repository, isYjsReady } = useContext(ProjectContext);
    const ydoc = repository?.getState();
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    const [cards, setCards] = useState<BoardCardData[]>([]);
    const [arrows, setArrows] = useState<BoardArrowData[]>([]);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const [isPanning, setIsPanning] = useState(false);
    const [isSnapping, setIsSnapping] = useState(true);
    const [cardContextMenu, setCardContextMenu] = useState<CardContextMenuState | null>(null);
    const [arrowContextMenu, setArrowContextMenu] = useState<ArrowContextMenuState | null>(null);
    const [isCameraReady, setIsCameraReady] = useState(false);
    const [connectingFrom, setConnectingFrom] = useState<{ cardId: string; side: string } | null>(null);
    const [connectingLine, setConnectingLine] = useState<{ x: number; y: number } | null>(null);
    const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
    const [selectionRect, setSelectionRect] = useState<{
        startX: number;
        startY: number;
        endX: number;
        endY: number;
    } | null>(null);
    const hasInitializedCamera = useRef(false);
    const panStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
    const selectionStart = useRef<{ x: number; y: number } | null>(null);
    const isSelecting = useRef(false);

    // Center camera to fit all cards
    const centerCameraOnCards = useCallback((cardsToFit: BoardCardData[]) => {
        const container = containerRef.current;
        if (!container || cardsToFit.length === 0) return;

        // Calculate bounding box of all cards
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const card of cardsToFit) {
            minX = Math.min(minX, card.x);
            minY = Math.min(minY, card.y);
            maxX = Math.max(maxX, card.x + card.width);
            maxY = Math.max(maxY, card.y + card.height);
        }

        // Add padding around the bounding box
        const padding = 100;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;

        const boundsWidth = maxX - minX;
        const boundsHeight = maxY - minY;
        const boundsCenterX = (minX + maxX) / 2;
        const boundsCenterY = (minY + maxY) / 2;

        const rect = container.getBoundingClientRect();
        const viewportWidth = rect.width;
        const viewportHeight = rect.height;

        // Calculate scale to fit bounds in viewport
        const scaleX = viewportWidth / boundsWidth;
        const scaleY = viewportHeight / boundsHeight;
        const newScale = Math.min(Math.max(Math.min(scaleX, scaleY), MIN_SCALE), MAX_SCALE);

        // Calculate offset to center the bounds
        const newOffsetX = viewportWidth / 2 - boundsCenterX * newScale;
        const newOffsetY = viewportHeight / 2 - boundsCenterY * newScale;

        setScale(newScale);
        setOffset({ x: newOffsetX, y: newOffsetY });
    }, []);

    // Sync cards with Yjs
    useEffect(() => {
        if (!ydoc || !isYjsReady) return;

        const boardMap = getBoardMap(ydoc);

        const syncCards = () => {
            const cardsData = boardMap.get("cards");
            if (cardsData) {
                try {
                    const parsed = typeof cardsData === "string" ? JSON.parse(cardsData) : cardsData;
                    setCards(parsed);

                    // Center camera on first load
                    if (!hasInitializedCamera.current) {
                        hasInitializedCamera.current = true;
                        if (parsed.length > 0) {
                            // Small delay to ensure container is rendered
                            setTimeout(() => {
                                centerCameraOnCards(parsed);
                                setIsCameraReady(true);
                            }, 50);
                        } else {
                            setIsCameraReady(true);
                        }
                    }
                } catch (e) {
                    console.error("[BoardCanvas] Failed to parse cards:", e);
                }
            } else {
                // No cards data yet, mark camera as ready
                if (!hasInitializedCamera.current) {
                    hasInitializedCamera.current = true;
                    setIsCameraReady(true);
                }
            }

            // Sync arrows
            const arrowsData = boardMap.get("arrows");
            if (arrowsData) {
                try {
                    const parsed = typeof arrowsData === "string" ? JSON.parse(arrowsData) : arrowsData;
                    setArrows(parsed);
                } catch (e) {
                    console.error("[BoardCanvas] Failed to parse arrows:", e);
                }
            }
        };

        syncCards();
        boardMap.observe(syncCards);

        return () => {
            boardMap.unobserve(syncCards);
        };
    }, [ydoc, isYjsReady, centerCameraOnCards]);

    // Save cards to Yjs
    const saveCards = useCallback(
        (newCards: BoardCardData[]) => {
            if (!ydoc || !isYjsReady) return;
            const boardMap = getBoardMap(ydoc);
            boardMap.set("cards", JSON.stringify(newCards));
        },
        [ydoc, isYjsReady],
    );

    // Save arrows to Yjs
    const saveArrows = useCallback(
        (newArrows: BoardArrowData[]) => {
            if (!ydoc || !isYjsReady) return;
            const boardMap = getBoardMap(ydoc);
            boardMap.set("arrows", JSON.stringify(newArrows));
        },
        [ydoc, isYjsReady],
    );

    // Handle keyboard events for snapping
    useEffect(() => {
        if (!isVisible) {
            setIsSnapping(true); // Reset snap state when hidden
            return;
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Shift") {
                setIsSnapping(false);
            }
            if (e.key === "Escape") {
                setSelectedCardIds(new Set());
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === "Shift") {
                setIsSnapping(true);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [isVisible]);

    // Close context menus on click anywhere
    useEffect(() => {
        if (!isVisible) {
            if (cardContextMenu) setCardContextMenu(null);
            if (arrowContextMenu) setArrowContextMenu(null);
            return;
        }

        const handleClick = () => {
            if (cardContextMenu) setCardContextMenu(null);
            if (arrowContextMenu) setArrowContextMenu(null);
        };

        window.addEventListener("click", handleClick);
        return () => {
            window.removeEventListener("click", handleClick);
        };
    }, [cardContextMenu, arrowContextMenu, isVisible]);

    // Panning with middle-click
    const handlePanMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (e.button !== 1) return;
            e.preventDefault(); // Prevent autoscroll on middle-click

            setIsPanning(true);
            panStart.current = {
                x: e.clientX,
                y: e.clientY,
                offsetX: offset.x,
                offsetY: offset.y,
            };
        },
        [offset],
    );

    // Selection rectangle with left-click on empty canvas
    const handleSelectionMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (e.button !== 0) return;
            if ((e.target as HTMLElement).closest(`.${styles.card}`)) return;
            if ((e.target as HTMLElement).closest(`.${styles.zoom_controls}`)) return;
            if ((e.target as HTMLElement).closest(`.${styles.hints}`)) return;
            if ((e.target as HTMLElement).closest(`.${styles.context_menu}`)) return;

            const container = containerRef.current;
            if (!container) return;

            const rect = container.getBoundingClientRect();
            const canvasX = (e.clientX - rect.left - offset.x) / scale;
            const canvasY = (e.clientY - rect.top - offset.y) / scale;

            selectionStart.current = { x: canvasX, y: canvasY };
            isSelecting.current = true;
            setSelectionRect({ startX: canvasX, startY: canvasY, endX: canvasX, endY: canvasY });
            setSelectedCardIds(new Set());
        },
        [offset, scale],
    );

    const handleContainerMouseDown = useCallback(
        (e: React.MouseEvent) => {
            handlePanMouseDown(e);
            handleSelectionMouseDown(e);
        },
        [handlePanMouseDown, handleSelectionMouseDown],
    );

    const handlePanMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!isPanning) return;

            const dx = e.clientX - panStart.current.x;
            const dy = e.clientY - panStart.current.y;

            setOffset({
                x: panStart.current.offsetX + dx,
                y: panStart.current.offsetY + dy,
            });
        },
        [isPanning],
    );

    const handlePanMouseUp = useCallback(() => {
        setIsPanning(false);
    }, []);

    useEffect(() => {
        if (isPanning) {
            window.addEventListener("mousemove", handlePanMouseMove);
            window.addEventListener("mouseup", handlePanMouseUp);
            return () => {
                window.removeEventListener("mousemove", handlePanMouseMove);
                window.removeEventListener("mouseup", handlePanMouseUp);
            };
        }
    }, [isPanning, handlePanMouseMove, handlePanMouseUp]);

    // Keep refs in sync for selection handlers to avoid stale closures
    const offsetRef = useRef(offset);
    const scaleRef = useRef(scale);
    const cardsRef = useRef(cards);
    useEffect(() => { offsetRef.current = offset; }, [offset]);
    useEffect(() => { scaleRef.current = scale; }, [scale]);
    useEffect(() => { cardsRef.current = cards; }, [cards]);

    // Selection rectangle global listeners
    useEffect(() => {
        if (!selectionRect) return;

        const onMouseMove = (e: MouseEvent) => {
            if (!isSelecting.current) return;

            const container = containerRef.current;
            if (!container) return;

            const rect = container.getBoundingClientRect();
            const currentOffset = offsetRef.current;
            const currentScale = scaleRef.current;
            const canvasX = (e.clientX - rect.left - currentOffset.x) / currentScale;
            const canvasY = (e.clientY - rect.top - currentOffset.y) / currentScale;

            setSelectionRect((prev) =>
                prev ? { ...prev, endX: canvasX, endY: canvasY } : null,
            );
        };

        const onMouseUp = () => {
            if (!isSelecting.current) {
                isSelecting.current = false;
                selectionStart.current = null;
                setSelectionRect(null);
                return;
            }

            setSelectionRect((currentRect) => {
                if (!currentRect) return null;

                // Calculate normalized selection box
                const left = Math.min(currentRect.startX, currentRect.endX);
                const top = Math.min(currentRect.startY, currentRect.endY);
                const right = Math.max(currentRect.startX, currentRect.endX);
                const bottom = Math.max(currentRect.startY, currentRect.endY);

                // Only select if the rectangle has meaningful size (prevent click-only)
                const width = right - left;
                const height = bottom - top;

                if (width > 5 || height > 5) {
                    // Find cards that intersect the selection box
                    const selected = new Set<string>();
                    for (const card of cardsRef.current) {
                        const cardRight = card.x + card.width;
                        const cardBottom = card.y + card.height;

                        if (card.x < right && cardRight > left && card.y < bottom && cardBottom > top) {
                            selected.add(card.id);
                        }
                    }
                    setSelectedCardIds(selected);
                }

                return null; // Clear the selection rect
            });

            isSelecting.current = false;
            selectionStart.current = null;
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [selectionRect !== null]); // eslint-disable-line react-hooks/exhaustive-deps

    // Zoom with mouse wheel - centered on cursor
    const handleWheel = useCallback(
        (e: React.WheelEvent) => {
            e.preventDefault();

            const container = containerRef.current;
            if (!container) return;

            const rect = container.getBoundingClientRect();
            const cursorX = e.clientX - rect.left;
            const cursorY = e.clientY - rect.top;

            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * delta));

            // Calculate the point in canvas space under the cursor
            const canvasX = (cursorX - offset.x) / scale;
            const canvasY = (cursorY - offset.y) / scale;

            // Calculate new offset so the same canvas point stays under cursor
            const newOffsetX = cursorX - canvasX * newScale;
            const newOffsetY = cursorY - canvasY * newScale;

            setScale(newScale);
            setOffset({ x: newOffsetX, y: newOffsetY });
        },
        [scale, offset],
    );

    // Zoom from buttons - centered on viewport
    const zoomFromCenter = useCallback(
        (zoomIn: boolean) => {
            const container = containerRef.current;
            if (!container) return;

            const rect = container.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            const delta = zoomIn ? 1.2 : 0.8;
            const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * delta));

            const canvasX = (centerX - offset.x) / scale;
            const canvasY = (centerY - offset.y) / scale;

            const newOffsetX = centerX - canvasX * newScale;
            const newOffsetY = centerY - canvasY * newScale;

            setScale(newScale);
            setOffset({ x: newOffsetX, y: newOffsetY });
        },
        [scale, offset],
    );

    // Create new card on double-click
    const handleDoubleClick = useCallback(
        (e: React.MouseEvent) => {
            if ((e.target as HTMLElement).closest(`.${styles.card}`)) return;
            if ((e.target as HTMLElement).closest(`.${styles.zoom_controls}`)) return;
            if ((e.target as HTMLElement).closest(`.${styles.hints}`)) return;

            // Clear selection when creating a new card
            setSelectedCardIds(new Set());

            const container = containerRef.current;
            if (!container) return;

            const rect = container.getBoundingClientRect();
            const x = (e.clientX - rect.left - offset.x) / scale;
            const y = (e.clientY - rect.top - offset.y) / scale;

            const randomColor = DEFAULT_CARD_COLORS[Math.floor(Math.random() * DEFAULT_CARD_COLORS.length)];

            const newCard: BoardCardData = {
                id: uuidv4(),
                title: "",
                description: "",
                color: randomColor,
                x: isSnapping ? Math.round(x / GRID_SIZE) * GRID_SIZE : x,
                y: isSnapping ? Math.round(y / GRID_SIZE) * GRID_SIZE : y,
                width: 450,
                height: 280,
            };

            const newCards = [...cards, newCard];
            setCards(newCards);
            saveCards(newCards);
        },
        [cards, offset, scale, isSnapping, saveCards],
    );

    // Update card (with multi-drag support)
    const handleUpdateCard = useCallback(
        (updatedCard: BoardCardData) => {
            if (selectedCardIds.has(updatedCard.id) && selectedCardIds.size > 1) {
                // Multi-drag: apply same delta to all selected cards
                const oldCard = cards.find((c) => c.id === updatedCard.id);
                if (oldCard) {
                    const dx = updatedCard.x - oldCard.x;
                    const dy = updatedCard.y - oldCard.y;
                    // Only apply multi-drag for position changes, not resize
                    if (dx !== 0 || dy !== 0) {
                        const isResize = updatedCard.width !== oldCard.width || updatedCard.height !== oldCard.height;
                        if (!isResize) {
                            const newCards = cards.map((c) => {
                                if (c.id === updatedCard.id) return updatedCard;
                                if (selectedCardIds.has(c.id)) return { ...c, x: c.x + dx, y: c.y + dy };
                                return c;
                            });
                            setCards(newCards);
                            saveCards(newCards);
                            return;
                        }
                    }
                }
            }
            // Single card update (existing logic)
            const newCards = cards.map((c) => (c.id === updatedCard.id ? updatedCard : c));
            setCards(newCards);
            saveCards(newCards);
        },
        [cards, selectedCardIds, saveCards],
    );

    // Delete card (and connected arrows)
    const handleDeleteCard = useCallback(
        (id: string) => {
            const newCards = cards.filter((c) => c.id !== id);
            setCards(newCards);
            saveCards(newCards);
            // Also delete arrows connected to this card
            const newArrows = arrows.filter((a) => a.fromCardId !== id && a.toCardId !== id);
            setArrows(newArrows);
            saveArrows(newArrows);
            setCardContextMenu(null);
        },
        [cards, arrows, saveCards, saveArrows],
    );

    // Change card color
    const handleChangeCardColor = useCallback(
        (id: string, color: string) => {
            const newCards = cards.map((c) => (c.id === id ? { ...c, color } : c));
            setCards(newCards);
            saveCards(newCards);
            setCardContextMenu(null);
        },
        [cards, saveCards],
    );

    // Duplicate card
    const handleDuplicateCard = useCallback(
        (card: BoardCardData) => {
            const newCard: BoardCardData = {
                ...card,
                id: uuidv4(),
                x: card.x + 20,
                y: card.y + 20,
            };
            const newCards = [...cards, newCard];
            setCards(newCards);
            saveCards(newCards);
            setCardContextMenu(null);
        },
        [cards, saveCards],
    );

    // Context menu for card
    const handleCardContextMenu = useCallback((e: React.MouseEvent, card: BoardCardData) => {
        setCardContextMenu({
            position: { x: e.clientX, y: e.clientY },
            card,
        });
    }, []);

    // Context menu for arrow
    const handleArrowContextMenu = useCallback((e: React.MouseEvent, arrow: BoardArrowData) => {
        e.preventDefault();
        e.stopPropagation();
        setArrowContextMenu({
            position: { x: e.clientX, y: e.clientY },
            arrow,
        });
    }, []);

    // Delete arrow
    const handleDeleteArrow = useCallback(
        (id: string) => {
            const newArrows = arrows.filter((a) => a.id !== id);
            setArrows(newArrows);
            saveArrows(newArrows);
            setArrowContextMenu(null);
        },
        [arrows, saveArrows],
    );

    // Get connection point position for a card
    const getConnectionPoint = useCallback((card: BoardCardData, side: "top" | "right" | "bottom" | "left") => {
        const centerX = card.x + card.width / 2;
        const centerY = card.y + card.height / 2;

        switch (side) {
            case "top":
                return { x: centerX, y: card.y };
            case "right":
                return { x: card.x + card.width, y: centerY };
            case "bottom":
                return { x: centerX, y: card.y + card.height };
            case "left":
                return { x: card.x, y: centerY };
        }
    }, []);

    // Calculate best connection points between two cards with perpendicular tangent directions
    const getArrowPoints = useCallback(
        (fromCard: BoardCardData, toCard: BoardCardData) => {
            const fromCenter = { x: fromCard.x + fromCard.width / 2, y: fromCard.y + fromCard.height / 2 };
            const toCenter = { x: toCard.x + toCard.width / 2, y: toCard.y + toCard.height / 2 };

            const dx = toCenter.x - fromCenter.x;
            const dy = toCenter.y - fromCenter.y;

            let fromSide: "top" | "right" | "bottom" | "left";
            let toSide: "top" | "right" | "bottom" | "left";

            if (Math.abs(dx) > Math.abs(dy)) {
                // Horizontal dominant
                fromSide = dx > 0 ? "right" : "left";
                toSide = dx > 0 ? "left" : "right";
            } else {
                // Vertical dominant
                fromSide = dy > 0 ? "bottom" : "top";
                toSide = dy > 0 ? "top" : "bottom";
            }

            // Get perpendicular direction vectors for each side
            const getDirection = (side: "top" | "right" | "bottom" | "left") => {
                switch (side) {
                    case "top":
                        return { x: 0, y: -1 };
                    case "right":
                        return { x: 1, y: 0 };
                    case "bottom":
                        return { x: 0, y: 1 };
                    case "left":
                        return { x: -1, y: 0 };
                }
            };

            return {
                from: getConnectionPoint(fromCard, fromSide),
                to: getConnectionPoint(toCard, toSide),
                fromDir: getDirection(fromSide),
                toDir: getDirection(toSide),
            };
        },
        [getConnectionPoint],
    );

    // Handle starting a connection from a card
    const handleStartConnection = useCallback((cardId: string, side: string, initialX: number, initialY: number) => {
        setConnectingFrom({ cardId, side });
        setConnectingLine({ x: initialX, y: initialY });
    }, []);

    // Handle mouse move while connecting
    const handleConnectionMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!connectingFrom || !containerRef.current) return;

            const rect = containerRef.current.getBoundingClientRect();
            const x = (e.clientX - rect.left - offset.x) / scale;
            const y = (e.clientY - rect.top - offset.y) / scale;

            setConnectingLine({ x, y });
        },
        [connectingFrom, offset, scale],
    );

    // Handle completing a connection
    const handleCompleteConnection = useCallback(
        (toCardId: string) => {
            if (!connectingFrom || connectingFrom.cardId === toCardId) {
                setConnectingFrom(null);
                setConnectingLine(null);
                return;
            }

            // Check if arrow already exists
            const exists = arrows.some(
                (a) =>
                    (a.fromCardId === connectingFrom.cardId && a.toCardId === toCardId) ||
                    (a.fromCardId === toCardId && a.toCardId === connectingFrom.cardId),
            );

            if (!exists) {
                const newArrow: BoardArrowData = {
                    id: uuidv4(),
                    fromCardId: connectingFrom.cardId,
                    toCardId,
                };
                const newArrows = [...arrows, newArrow];
                setArrows(newArrows);
                saveArrows(newArrows);
            }

            setConnectingFrom(null);
            setConnectingLine(null);
        },
        [connectingFrom, arrows, saveArrows],
    );

    // Cancel connection on mouse up if not on a card
    const handleConnectionMouseUp = useCallback(() => {
        setConnectingFrom(null);
        setConnectingLine(null);
    }, []);

    // Setup connection mouse events
    useEffect(() => {
        if (connectingFrom) {
            window.addEventListener("mousemove", handleConnectionMouseMove);
            window.addEventListener("mouseup", handleConnectionMouseUp);
            return () => {
                window.removeEventListener("mousemove", handleConnectionMouseMove);
                window.removeEventListener("mouseup", handleConnectionMouseUp);
            };
        }
    }, [connectingFrom, handleConnectionMouseMove, handleConnectionMouseUp]);

    // Generate grid pattern
    const gridPattern = useMemo(() => {
        const scaledGridSize = GRID_SIZE * scale;
        const offsetX = offset.x % scaledGridSize;
        const offsetY = offset.y % scaledGridSize;

        return {
            backgroundSize: `${scaledGridSize}px ${scaledGridSize}px`,
            backgroundPosition: `${offsetX}px ${offsetY}px`,
        };
    }, [scale, offset]);

    return (
        <div className={styles.board_wrapper}>
            <div className={styles.board_shadow} />
            <div
                ref={containerRef}
                className={`${styles.container} ${isPanning ? styles.panning : ""}`}
                onMouseDown={handleContainerMouseDown}
                onDoubleClick={handleDoubleClick}
                onWheel={handleWheel}
            >
                <div className={styles.grid} style={gridPattern} />

                <div
                    ref={canvasRef}
                    className={`${styles.canvas} ${!isCameraReady ? styles.canvas_hidden : ""}`}
                    style={{
                        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    }}
                >
                    {/* SVG layer for arrows */}
                    <svg className={styles.arrows_svg}>
                        {arrows.map((arrow) => {
                            const fromCard = cards.find((c) => c.id === arrow.fromCardId);
                            const toCard = cards.find((c) => c.id === arrow.toCardId);
                            if (!fromCard || !toCard) return null;

                            const points = getArrowPoints(fromCard, toCard);

                            // Calculate distance for control point offset (perpendicular to border)
                            const dist = Math.hypot(points.to.x - points.from.x, points.to.y - points.from.y);
                            const controlDist = Math.max(50, dist * 0.4);

                            // Control points extend perpendicular to the borders
                            const cx1 = points.from.x + points.fromDir.x * controlDist;
                            const cy1 = points.from.y + points.fromDir.y * controlDist;
                            const cx2 = points.to.x + points.toDir.x * controlDist;
                            const cy2 = points.to.y + points.toDir.y * controlDist;

                            // Calculate arrowhead angle from the curve's end tangent
                            const angle = Math.atan2(points.to.y - cy2, points.to.x - cx2);
                            const arrowLength = 24;
                            const arrowWidth = 8; // half-width

                            // Arrowhead points matching original marker shape: M 0 0 L 12 4 L 0 8 L 3 4 Z
                            // Back corners (perpendicular to arrow direction)
                            const ax1 = points.to.x - arrowLength * Math.cos(angle) + arrowWidth * Math.sin(angle);
                            const ay1 = points.to.y - arrowLength * Math.sin(angle) - arrowWidth * Math.cos(angle);
                            const ax2 = points.to.x - arrowLength * Math.cos(angle) - arrowWidth * Math.sin(angle);
                            const ay2 = points.to.y - arrowLength * Math.sin(angle) + arrowWidth * Math.cos(angle);
                            // Inner notch (25% from back toward tip)
                            const notchDepth = arrowLength * 0.75;
                            const axm = points.to.x - notchDepth * Math.cos(angle);
                            const aym = points.to.y - notchDepth * Math.sin(angle);

                            // Shorten the line to end at the notch point so it doesn't extend past the arrowhead
                            const lineEndX = axm;
                            const lineEndY = aym;

                            const pathD = `M ${points.from.x} ${points.from.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${lineEndX} ${lineEndY}`;
                            const arrowheadD = `M ${ax1} ${ay1} L ${points.to.x} ${points.to.y} L ${ax2} ${ay2} L ${axm} ${aym} Z`;

                            return (
                                <g key={arrow.id} className={styles.arrow_group}>
                                    {/* Invisible hitbox for easier clicking */}
                                    <path
                                        className={styles.arrow_hitbox}
                                        d={pathD}
                                        fill="none"
                                        onContextMenu={(e) => handleArrowContextMenu(e, arrow)}
                                    />
                                    {/* Visible arrow line */}
                                    <path
                                        className={styles.arrow_line}
                                        d={pathD}
                                        fill="none"
                                        stroke="var(--secondary-text)"
                                        strokeWidth={2.5}
                                    />
                                    {/* Arrowhead */}
                                    <path className={styles.arrow_head} d={arrowheadD} fill="var(--secondary-text)" />
                                </g>
                            );
                        })}
                        {/* Line while connecting */}
                        {connectingFrom &&
                            connectingLine &&
                            (() => {
                                const fromCard = cards.find((c) => c.id === connectingFrom.cardId);
                                if (!fromCard) return null;

                                const fromCenter = {
                                    x: fromCard.x + fromCard.width / 2,
                                    y: fromCard.y + fromCard.height / 2,
                                };
                                const dx = connectingLine.x - fromCenter.x;
                                const dy = connectingLine.y - fromCenter.y;

                                // Determine best exit side based on cursor direction
                                let fromSide: "top" | "right" | "bottom" | "left";
                                let fromDir: { x: number; y: number };

                                if (Math.abs(dx) > Math.abs(dy)) {
                                    fromSide = dx > 0 ? "right" : "left";
                                    fromDir = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
                                } else {
                                    fromSide = dy > 0 ? "bottom" : "top";
                                    fromDir = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
                                }

                                const fromPoint = getConnectionPoint(fromCard, fromSide);
                                const dist = Math.hypot(connectingLine.x - fromPoint.x, connectingLine.y - fromPoint.y);
                                const controlDist = Math.max(30, dist * 0.3);

                                const cx = fromPoint.x + fromDir.x * controlDist;
                                const cy = fromPoint.y + fromDir.y * controlDist;

                                const pathD = `M ${fromPoint.x} ${fromPoint.y} Q ${cx} ${cy}, ${connectingLine.x} ${connectingLine.y}`;

                                return (
                                    <path
                                        className={styles.arrow_line_connecting}
                                        d={pathD}
                                        fill="none"
                                        stroke="var(--secondary-text)"
                                        strokeWidth={2.5}
                                        strokeDasharray="8,4"
                                    />
                                );
                            })()}
                    </svg>

                    {cards.map((card) => (
                        <BoardCard
                            key={card.id}
                            card={card}
                            scale={scale}
                            isSnapping={isSnapping}
                            gridSize={GRID_SIZE}
                            onUpdate={handleUpdateCard}
                            onContextMenu={handleCardContextMenu}
                            onStartConnection={handleStartConnection}
                            onCompleteConnection={handleCompleteConnection}
                            isConnecting={!!connectingFrom}
                            isSelected={selectedCardIds.has(card.id)}
                        />
                    ))}

                    {/* Selection rectangle */}
                    {selectionRect && (
                        <div
                            className={styles.selection_rect}
                            style={{
                                left: Math.min(selectionRect.startX, selectionRect.endX),
                                top: Math.min(selectionRect.startY, selectionRect.endY),
                                width: Math.abs(selectionRect.endX - selectionRect.startX),
                                height: Math.abs(selectionRect.endY - selectionRect.startY),
                            }}
                        />
                    )}
                </div>

                {/* Card Context Menu */}
                {cardContextMenu && (
                    <div
                        className={styles.context_menu}
                        style={{
                            top: cardContextMenu.position.y,
                            left: cardContextMenu.position.x,
                        }}
                    >
                        <div className={styles.context_menu_colors}>
                            {DEFAULT_CARD_COLORS.map((color) => (
                                <button
                                    key={color}
                                    className={`${styles.context_menu_color_swatch} ${cardContextMenu.card.color === color ? styles.context_menu_color_swatch_active : ""}`}
                                    style={{ backgroundColor: color }}
                                    onClick={() => handleChangeCardColor(cardContextMenu.card.id, color)}
                                />
                            ))}
                        </div>
                        <div
                            className={styles.context_menu_item}
                            onClick={() => handleDuplicateCard(cardContextMenu.card)}
                        >
                            <Copy size={16} />
                            <p className="unselectable">Duplicate</p>
                        </div>
                        <div
                            className={styles.context_menu_item}
                            onClick={() => handleDeleteCard(cardContextMenu.card.id)}
                        >
                            <Trash2 size={16} />
                            <p className="unselectable">Delete</p>
                        </div>
                    </div>
                )}

                {/* Arrow Context Menu */}
                {arrowContextMenu && (
                    <div
                        className={styles.context_menu}
                        style={{
                            top: arrowContextMenu.position.y,
                            left: arrowContextMenu.position.x,
                        }}
                    >
                        <div
                            className={styles.context_menu_item}
                            onClick={() => handleDeleteArrow(arrowContextMenu.arrow.id)}
                        >
                            <Trash2 size={16} />
                            <p className="unselectable">Delete</p>
                        </div>
                    </div>
                )}

                <div className={styles.zoom_controls}>
                    <button className={styles.zoom_btn} onClick={() => zoomFromCenter(false)}>
                        <Minus />
                    </button>
                    <span className={styles.zoom_level}>{Math.round(scale * 100)}%</span>
                    <button className={styles.zoom_btn} onClick={() => zoomFromCenter(true)}>
                        <Plus />
                    </button>
                </div>

                <div className={styles.hints}>
                    <span>Middle-click to pan</span>
                    <span>Drag to select cards</span>
                    <span>Double-click to create card</span>
                    <span>Hold Shift to move freely</span>
                </div>
            </div>
        </div>
    );
};

export default BoardCanvas;
