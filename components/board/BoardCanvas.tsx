"use client";

import { useContext, useRef, useState, useCallback, useEffect, useMemo } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { getBoardMap } from "@src/lib/project/project-yjs";
import BoardCard, { BoardCardData } from "./BoardCard";
import styles from "./BoardCanvas.module.css";
import { v4 as uuidv4 } from "uuid";
import { Trash2, Plus, Minus } from "lucide-react";

const GRID_SIZE = 20;
const MIN_SCALE = 0.25;
const MAX_SCALE = 2;

const DEFAULT_CARD_COLORS = ["#3b82f6", "#22c55e", "#ef4444", "#eab308", "#8b5cf6", "#ec4899"];

interface ContextMenuState {
    position: { x: number; y: number };
    card: BoardCardData;
}

const BoardCanvas = () => {
    const { repository, isYjsReady } = useContext(ProjectContext);
    const ydoc = repository?.getState();
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    const [cards, setCards] = useState<BoardCardData[]>([]);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const [isPanning, setIsPanning] = useState(false);
    const [isSnapping, setIsSnapping] = useState(false);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [isCameraReady, setIsCameraReady] = useState(false);
    const hasInitializedCamera = useRef(false);
    const panStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

    // Center camera to fit all cards
    const centerCameraOnCards = useCallback(
        (cardsToFit: BoardCardData[]) => {
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
        },
        []
    );

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
        [ydoc, isYjsReady]
    );

    // Handle keyboard events for snapping
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Shift") {
                setIsSnapping(true);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === "Shift") {
                setIsSnapping(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    // Close context menu on click anywhere
    useEffect(() => {
        const handleClick = () => {
            if (contextMenu) setContextMenu(null);
        };

        window.addEventListener("click", handleClick);
        return () => {
            window.removeEventListener("click", handleClick);
        };
    }, [contextMenu]);

    // Panning with left-click
    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (e.button !== 0) return;
            if ((e.target as HTMLElement).closest(`.${styles.card}`)) return;

            setIsPanning(true);
            panStart.current = {
                x: e.clientX,
                y: e.clientY,
                offsetX: offset.x,
                offsetY: offset.y,
            };
        },
        [offset]
    );

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!isPanning) return;

            const dx = e.clientX - panStart.current.x;
            const dy = e.clientY - panStart.current.y;

            setOffset({
                x: panStart.current.offsetX + dx,
                y: panStart.current.offsetY + dy,
            });
        },
        [isPanning]
    );

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
    }, []);

    useEffect(() => {
        if (isPanning) {
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", handleMouseUp);
            return () => {
                window.removeEventListener("mousemove", handleMouseMove);
                window.removeEventListener("mouseup", handleMouseUp);
            };
        }
    }, [isPanning, handleMouseMove, handleMouseUp]);

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
        [scale, offset]
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
        [scale, offset]
    );

    // Create new card on double-click
    const handleDoubleClick = useCallback(
        (e: React.MouseEvent) => {
            if ((e.target as HTMLElement).closest(`.${styles.card}`)) return;
            if ((e.target as HTMLElement).closest(`.${styles.zoom_controls}`)) return;
            if ((e.target as HTMLElement).closest(`.${styles.hints}`)) return;

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
        [cards, offset, scale, isSnapping, saveCards]
    );

    // Update card
    const handleUpdateCard = useCallback(
        (updatedCard: BoardCardData) => {
            const newCards = cards.map((c) => (c.id === updatedCard.id ? updatedCard : c));
            setCards(newCards);
            saveCards(newCards);
        },
        [cards, saveCards]
    );

    // Delete card
    const handleDeleteCard = useCallback(
        (id: string) => {
            const newCards = cards.filter((c) => c.id !== id);
            setCards(newCards);
            saveCards(newCards);
            setContextMenu(null);
        },
        [cards, saveCards]
    );

    // Context menu for card
    const handleCardContextMenu = useCallback((e: React.MouseEvent, card: BoardCardData) => {
        setContextMenu({
            position: { x: e.clientX, y: e.clientY },
            card,
        });
    }, []);

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
                onMouseDown={handleMouseDown}
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
                    {cards.map((card) => (
                        <BoardCard
                            key={card.id}
                            card={card}
                            scale={scale}
                            isSnapping={isSnapping}
                            gridSize={GRID_SIZE}
                            onUpdate={handleUpdateCard}
                            onContextMenu={handleCardContextMenu}
                        />
                    ))}
                </div>

                {/* Context Menu */}
                {contextMenu && (
                    <div
                        className={styles.context_menu}
                        style={{
                            top: contextMenu.position.y,
                            left: contextMenu.position.x,
                        }}
                    >
                        <div className={styles.context_menu_item} onClick={() => handleDeleteCard(contextMenu.card.id)}>
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
                    <span>Double-click to create card</span>
                    <span>Hold Shift to snap to grid</span>
                </div>
            </div>
        </div>
    );
};

export default BoardCanvas;
