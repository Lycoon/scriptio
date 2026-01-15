"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import styles from "./BoardCanvas.module.css";
import { ColorPicker } from "../utils/ColorPicker";

export interface BoardCardData {
    id: string;
    title: string;
    description: string;
    color: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

interface BoardCardProps {
    card: BoardCardData;
    scale: number;
    isSnapping: boolean;
    gridSize: number;
    onUpdate: (card: BoardCardData) => void;
    onContextMenu: (e: React.MouseEvent, card: BoardCardData) => void;
}

const CARD_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280"];

const BoardCard = ({ card, scale, isSnapping, gridSize, onUpdate, onContextMenu }: BoardCardProps) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [localTitle, setLocalTitle] = useState(card.title);
    const [localDescription, setLocalDescription] = useState(card.description);
    const dragOffset = useRef({ x: 0, y: 0 });
    const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });

    useEffect(() => {
        setLocalTitle(card.title);
        setLocalDescription(card.description);
    }, [card.title, card.description]);

    const snapToGrid = useCallback(
        (value: number) => {
            if (isSnapping) {
                return Math.round(value / gridSize) * gridSize;
            }
            return value;
        },
        [isSnapping, gridSize]
    );

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (isEditing || isEditingTitle || (e.target as HTMLElement).closest(`.${styles.card_resize_handle}`))
                return;
            e.stopPropagation();

            const rect = cardRef.current?.getBoundingClientRect();
            if (!rect) return;

            dragOffset.current = {
                x: (e.clientX - rect.left) / scale,
                y: (e.clientY - rect.top) / scale,
            };
            setIsDragging(true);
        },
        [isEditing, isEditingTitle, scale]
    );

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!isDragging && !isResizing) return;

            if (isDragging) {
                const parent = cardRef.current?.parentElement;
                if (!parent) return;

                const parentRect = parent.getBoundingClientRect();
                const newX = (e.clientX - parentRect.left) / scale - dragOffset.current.x;
                const newY = (e.clientY - parentRect.top) / scale - dragOffset.current.y;

                onUpdate({
                    ...card,
                    x: snapToGrid(newX),
                    y: snapToGrid(newY),
                });
            }

            if (isResizing) {
                const dx = (e.clientX - resizeStart.current.x) / scale;
                const dy = (e.clientY - resizeStart.current.y) / scale;

                const newWidth = Math.max(150, resizeStart.current.width + dx);
                const newHeight = Math.max(100, resizeStart.current.height + dy);

                onUpdate({
                    ...card,
                    width: snapToGrid(newWidth),
                    height: snapToGrid(newHeight),
                });
            }
        },
        [isDragging, isResizing, card, onUpdate, scale, snapToGrid]
    );

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        setIsResizing(false);
    }, []);

    const handleResizeStart = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            resizeStart.current = {
                x: e.clientX,
                y: e.clientY,
                width: card.width,
                height: card.height,
            };
            setIsResizing(true);
        },
        [card.width, card.height]
    );

    useEffect(() => {
        if (isDragging || isResizing) {
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", handleMouseUp);
            return () => {
                window.removeEventListener("mousemove", handleMouseMove);
                window.removeEventListener("mouseup", handleMouseUp);
            };
        }
    }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(true);
    }, []);

    const handleTitleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditingTitle(true);
    }, []);

    const handleTitleBlur = useCallback(() => {
        setIsEditingTitle(false);
        if (localTitle !== card.title) {
            onUpdate({
                ...card,
                title: localTitle,
            });
        }
    }, [card, localTitle, onUpdate]);

    const handleDescriptionBlur = useCallback(() => {
        setIsEditing(false);
        if (localDescription !== card.description) {
            onUpdate({
                ...card,
                description: localDescription,
            });
        }
    }, [card, localDescription, onUpdate]);

    const handleColorChange = useCallback(
        (color: string | undefined) => {
            onUpdate({ ...card, color: color || "" });
        },
        [card, onUpdate]
    );

    const handleTitleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            e.stopPropagation();
            if (e.key === "Escape") {
                setIsEditingTitle(false);
                setLocalTitle(card.title);
            }
            if (e.key === "Enter") {
                handleTitleBlur();
            }
        },
        [card.title, handleTitleBlur]
    );

    const handleDescriptionKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            e.stopPropagation();
            if (e.key === "Escape") {
                setIsEditing(false);
                setLocalDescription(card.description);
            }
        },
        [card.description]
    );

    const handleRightClick = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu(e, card);
        },
        [card, onContextMenu]
    );

    return (
        <div
            ref={cardRef}
            className={`${styles.card} ${isDragging ? styles.card_dragging : ""}`}
            style={{
                left: card.x,
                top: card.y,
                width: card.width,
                height: card.height,
                borderColor: card.color,
                backgroundColor: card.color,
            }}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleRightClick}
        >
            <div className={styles.card_header} style={{ backgroundColor: card.color }}>
                <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                    <ColorPicker
                        value={card.color || undefined}
                        onChange={handleColorChange}
                        colors={CARD_COLORS}
                        allowClear={false}
                    />
                </div>
                {isEditingTitle ? (
                    <input
                        type="text"
                        className={styles.card_header_title_input}
                        value={localTitle}
                        onChange={(e) => setLocalTitle(e.target.value)}
                        onBlur={handleTitleBlur}
                        onKeyDown={handleTitleKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        placeholder="Title"
                        autoFocus
                    />
                ) : (
                    <span className={styles.card_header_title} onDoubleClick={handleTitleDoubleClick}>
                        {card.title || "Untitled"}
                    </span>
                )}
            </div>

            <div className={styles.card_content}>
                {isEditing ? (
                    <textarea
                        className={styles.card_description_input}
                        value={localDescription}
                        onChange={(e) => setLocalDescription(e.target.value)}
                        onBlur={handleDescriptionBlur}
                        onKeyDown={handleDescriptionKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        placeholder="Description"
                        autoFocus
                    />
                ) : (
                    <p className={styles.card_description}>{card.description}</p>
                )}
            </div>

            <div className={styles.card_resize_handle} onMouseDown={handleResizeStart} />
        </div>
    );
};

export default BoardCard;
