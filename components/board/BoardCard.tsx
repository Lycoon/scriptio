"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import styles from "./BoardCanvas.module.css";
import { useTranslations } from "next-intl";
import { BoardCardData } from "@src/lib/project/project-state";
import { useAssetUrl } from "@src/lib/assets/use-asset-url";

interface BoardCardProps {
    card: BoardCardData;
    projectId: string;
    scale: number;
    isSnapping: boolean;
    gridSize: number;
    onUpdate: (card: BoardCardData) => void;
    onContextMenu: (e: React.MouseEvent, card: BoardCardData) => void;
    onStartConnection: (cardId: string, side: string, initialX: number, initialY: number) => void;
    onCompleteConnection: (cardId: string) => void;
    isConnecting: boolean;
    isSelected: boolean;
}

const BoardCard = ({
    card,
    projectId,
    scale,
    isSnapping,
    gridSize,
    onUpdate,
    onContextMenu,
    onStartConnection,
    onCompleteConnection,
    isConnecting,
    isSelected,
}: BoardCardProps) => {
    const isImage = card.type === "image";
    // Only resolves bytes for image cards (null assetId is a no-op for text notes).
    const imageUrl = useAssetUrl(projectId, isImage ? card.assetId : null);
    const t = useTranslations("board");
    const cardRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [localTitle, setLocalTitle] = useState(card.title);
    const [localDescription, setLocalDescription] = useState(card.description);
    const [prevTitle, setPrevTitle] = useState(card.title);
    const [prevDescription, setPrevDescription] = useState(card.description);
    const dragOffset = useRef({ x: 0, y: 0 });
    const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });

    if (prevTitle !== card.title) {
        setPrevTitle(card.title);
        setLocalTitle(card.title);
    }
    if (prevDescription !== card.description) {
        setPrevDescription(card.description);
        setLocalDescription(card.description);
    }

    const snapToGrid = useCallback(
        (value: number) => {
            if (isSnapping) {
                return Math.round(value / gridSize) * gridSize;
            }
            return value;
        },
        [isSnapping, gridSize],
    );

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (isEditing || isEditingTitle || (e.target as HTMLElement).closest(`.${styles.card_resize_handle}`))
                return;
            e.stopPropagation();
            e.preventDefault(); // Prevent Chromium's text selection from interfering with drag

            const rect = cardRef.current?.getBoundingClientRect();
            if (!rect) return;

            dragOffset.current = {
                x: (e.clientX - rect.left) / scale,
                y: (e.clientY - rect.top) / scale,
            };
            setIsDragging(true);
        },
        [isEditing, isEditingTitle, scale],
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
        [isDragging, isResizing, card, onUpdate, scale, snapToGrid],
    );

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        setIsResizing(false);
    }, []);

    const handleResizeStart = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            resizeStart.current = {
                x: e.clientX,
                y: e.clientY,
                width: card.width,
                height: card.height,
            };
            setIsResizing(true);
        },
        [card.width, card.height],
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
        [card.title, handleTitleBlur],
    );

    const handleDescriptionKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            e.stopPropagation();
            if (e.key === "Escape") {
                setIsEditing(false);
                setLocalDescription(card.description);
            }
        },
        [card.description],
    );

    const handleRightClick = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu(e, card);
        },
        [card, onContextMenu],
    );

    const handleConnectionHandleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            // Pass the center of the card as initial position (in canvas coordinates)
            const centerX = card.x + card.width / 2;
            const centerY = card.y + card.height / 2;
            onStartConnection(card.id, "center", centerX, centerY);
        },
        [card.id, card.x, card.y, card.width, card.height, onStartConnection],
    );

    const handleCardMouseUp = useCallback(
        (e: React.MouseEvent) => {
            if (isConnecting) {
                e.stopPropagation();
                onCompleteConnection(card.id);
            }
        },
        [card.id, isConnecting, onCompleteConnection],
    );

    return (
        <div
            ref={cardRef}
            className={`${styles.card} ${isImage ? styles.image_card : ""} ${isDragging ? styles.card_dragging : ""} ${isConnecting ? styles.card_connecting : ""} ${isSelected ? styles.card_selected : ""}`}
            style={{
                left: card.x,
                top: card.y,
                width: card.width,
                height: card.height,
                ...(isImage ? {} : { borderColor: card.color, backgroundColor: card.color }),
            }}
            onMouseDown={handleMouseDown}
            onMouseUp={handleCardMouseUp}
            onDoubleClick={isImage ? undefined : handleDoubleClick}
            onContextMenu={handleRightClick}
        >
            {isImage ? (
                imageUrl ? (
                    // Blob object URLs can't be optimized by next/image; a plain <img> is correct here.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt="" draggable={false} className={styles.card_image} />
                ) : (
                    <div className={styles.card_image_placeholder} />
                )
            ) : (
                <>
                    <div className={styles.card_header} style={{ backgroundColor: card.color }}>
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
                                placeholder={t("titlePlaceholder")}
                                autoFocus
                            />
                        ) : (
                            <span className={styles.card_header_title} onDoubleClick={handleTitleDoubleClick}>
                                {card.title || t("untitled")}
                            </span>
                        )}
                    </div>

                    <div
                        className={styles.card_content}
                        style={{ backgroundColor: `color-mix(in srgb, ${card.color} 20%, white)` }}
                        onDoubleClick={handleDoubleClick}
                    >
                        <p className={styles.card_description} style={{ display: isEditing ? "none" : undefined }}>
                            {card.description}
                        </p>
                        {isEditing && (
                            <textarea
                                className={styles.card_description_input}
                                value={localDescription}
                                onChange={(e) => setLocalDescription(e.target.value)}
                                onBlur={handleDescriptionBlur}
                                onKeyDown={handleDescriptionKeyDown}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                placeholder={t("descriptionPlaceholder")}
                                autoFocus
                            />
                        )}
                    </div>
                </>
            )}

            <div className={styles.card_resize_handle} onMouseDown={handleResizeStart} />

            {/* Connection handle */}
            <div className={styles.connection_handle} onMouseDown={handleConnectionHandleMouseDown} />
        </div>
    );
};

export default BoardCard;
