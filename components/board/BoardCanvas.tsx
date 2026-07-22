"use client";

import { useContext, useRef, useState, useCallback, useEffect, useMemo } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { BoardCardData, BoardArrowData, TimelineLayer } from "@src/lib/project/project-state";
import BoardCard from "./BoardCard";
import {
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuColorRow,
    ContextMenuSubmenu,
} from "@components/utils/ContextMenu";
import styles from "./BoardCanvas.module.css";
import { v7 as uuidv7 } from "uuid";
import { Trash2, Plus, Minus, Copy, ListTree, Layers, Mic, Square, Image as ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { DEFAULT_ITEM_COLORS } from "@src/lib/utils/colors";
import { importImageFile, importAudioFile, syncAssetToCloud } from "@src/lib/assets/asset-store";
import { CloudQuotaError } from "@src/lib/assets/cloud-asset-sync";
import { scheduleAssetGc } from "@src/lib/assets/asset-gc";
import { useIsPhone } from "@src/lib/utils/hooks";
import { useAudioRecorder } from "./use-audio-recorder";

const GRID_SIZE = 20;
const MIN_SCALE = 0.25;
const MAX_SCALE = 2;
/** Largest edge (in canvas px) an image card is sized to on first drop. */
const MAX_IMAGE_CARD_SIZE = 400;
/** Default size (in canvas px) of an audio voice-note card. */
const AUDIO_CARD_WIDTH = 260;
const AUDIO_CARD_HEIGHT = 96;

/** A random swatch from the default palette (used for new colored cards). */
function randomCardColor(): string {
    return DEFAULT_ITEM_COLORS[Math.floor(Math.random() * DEFAULT_ITEM_COLORS.length)];
}

/** Seconds → `m:ss` for the recording indicator. */
function formatRecordingTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

const BoardCanvas =({ isVisible, docId }: { isVisible: boolean; docId: string }) => {
    const { projectId, repository, isYjsReady, isReadOnly, boardFocusCardId, setBoardFocusCardId, timelineLayers } =
        useContext(ProjectContext);
    const { updateContextMenu } = useContext(UserContext);
    const t = useTranslations("board");
    const projectState = repository?.getState();
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    const [cards, setCards] = useState<BoardCardData[]>([]);
    const [arrows, setArrows] = useState<BoardArrowData[]>([]);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const [isPanning, setIsPanning] = useState(false);
    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const [isSnapping, setIsSnapping] = useState(true);
    /** Transient banner shown when an asset can't be saved (e.g. cloud quota). */
    const [assetError, setAssetError] = useState<string | null>(null);
    const assetErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const recorder = useAudioRecorder();
    const [prevIsVisible, setPrevIsVisible] = useState(isVisible);
    if (prevIsVisible !== isVisible) {
        setPrevIsVisible(isVisible);
        if (!isVisible) setIsSnapping(true);
    }
    const [isCameraReady, setIsCameraReady] = useState(false);
    const [connectingFrom, setConnectingFrom] = useState<{ cardId: string; side: string } | null>(
        null,
    );
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

    // ── Touch (mobile) state ──────────────────────────────────────────────────
    const isPhone = useIsPhone();
    const imageInputRef = useRef<HTMLInputElement>(null);
    const imageImportCoords = useRef({ x: 0, y: 0 });
    const gesture = useRef<{
        mode: "none" | "pan" | "pinch";
        startX: number;
        startY: number;
        startOffset: { x: number; y: number };
        startDist: number;
        startScale: number;
        pinchCanvasX: number;
        pinchCanvasY: number;
        moved: boolean;
    }>({
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
    const lastTouchPoint = useRef({ x: 0, y: 0 });

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

    // Focus a specific card when navigated to from the Timeline. Waits until the
    // board's cards have loaded and the target exists on this board, then centers
    // on it and clears the request so it fires once.
    useEffect(() => {
        if (!boardFocusCardId || !isVisible) return;
        const card = cards.find((c) => c.id === boardFocusCardId);
        if (!card) return;
        centerCameraOnCards([card]);
        setBoardFocusCardId(null);
    }, [boardFocusCardId, isVisible, cards, centerCameraOnCards, setBoardFocusCardId]);

    // Sync cards with Yjs
    useEffect(() => {
        if (!projectState || !isYjsReady) return;

        const boardMap = projectState.boardData(docId);

        const syncCards = () => {
            const cardsData = boardMap.get("cards");
            if (cardsData) {
                try {
                    const parsed =
                        typeof cardsData === "string" ? JSON.parse(cardsData) : cardsData;
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
                    const parsed =
                        typeof arrowsData === "string" ? JSON.parse(arrowsData) : arrowsData;
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
    }, [projectState, isYjsReady, docId, centerCameraOnCards]);

    // Save cards to Yjs
    const saveCards = useCallback(
        (newCards: BoardCardData[]) => {
            if (!projectState || !isYjsReady || isReadOnly) return;
            const boardMap = projectState.boardData(docId);
            boardMap.set("cards", JSON.stringify(newCards));
        },
        [projectState, isYjsReady, isReadOnly, docId],
    );

    // Save arrows to Yjs
    const saveArrows = useCallback(
        (newArrows: BoardArrowData[]) => {
            if (!projectState || !isYjsReady || isReadOnly) return;
            const boardMap = projectState.boardData(docId);
            boardMap.set("arrows", JSON.stringify(newArrows));
        },
        [projectState, isYjsReady, isReadOnly, docId],
    );

    // Handle keyboard events for snapping
    useEffect(() => {
        if (!isVisible) return;

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
            if ((e.target as HTMLElement).closest("[data-context-menu]")) return;

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
    /** Canvas-space coords captured when recording starts, for the resulting card. */
    const recordCoords = useRef({ x: 0, y: 0 });
    useEffect(() => {
        offsetRef.current = offset;
    }, [offset]);
    useEffect(() => {
        scaleRef.current = scale;
    }, [scale]);
    useEffect(() => {
        cardsRef.current = cards;
    }, [cards]);

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

            setSelectionRect((prev) => (prev ? { ...prev, endX: canvasX, endY: canvasY } : null));
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

                        if (
                            card.x < right &&
                            cardRight > left &&
                            card.y < bottom &&
                            cardBottom > top
                        ) {
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

    // Zoom with mouse wheel - centered on cursor.
    // Attached as a native non-passive listener (see effect below) because React
    // registers onWheel as passive, which makes preventDefault() a no-op and warns.
    const handleWheel = useCallback(
        (e: WheelEvent) => {
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

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        container.addEventListener("wheel", handleWheel, { passive: false });
        return () => container.removeEventListener("wheel", handleWheel);
    }, [handleWheel]);

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
            e.preventDefault();
            if ((e.target as HTMLElement).closest(`.${styles.card}`)) return;
            if ((e.target as HTMLElement).closest(`.${styles.zoom_controls}`)) return;

            // Clear selection when creating a new card
            setSelectedCardIds(new Set());

            const container = containerRef.current;
            if (!container) return;

            const rect = container.getBoundingClientRect();
            const x = (e.clientX - rect.left - offset.x) / scale;
            const y = (e.clientY - rect.top - offset.y) / scale;

            const newCard: BoardCardData = {
                id: uuidv7(),
                title: "",
                description: "",
                color: randomCardColor(),
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

    // Highlight the canvas while an OS file drag hovers over it.
    const handleDragOver = useCallback(
        (e: React.DragEvent) => {
            if (isReadOnly) return;
            if (!Array.from(e.dataTransfer.types).includes("Files")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setIsDraggingFile(true);
        },
        [isReadOnly],
    );

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        // Ignore leave events fired when moving between the container's children.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDraggingFile(false);
    }, []);

    // Show a transient error banner (auto-dismissed). Used when an asset can't be
    // persisted, e.g. the owner is out of cloud storage.
    const showAssetError = useCallback((message: string) => {
        setAssetError(message);
        if (assetErrorTimer.current) clearTimeout(assetErrorTimer.current);
        assetErrorTimer.current = setTimeout(() => setAssetError(null), 4000);
    }, []);

    useEffect(() => () => {
        if (assetErrorTimer.current) clearTimeout(assetErrorTimer.current);
    }, []);

    // Remove cards by id (used to roll back a card whose asset can't be saved).
    const removeCards = useCallback(
        (ids: Set<string>) => {
            const next = cardsRef.current.filter((c) => !ids.has(c.id));
            cardsRef.current = next; // keep the ref current so concurrent removals don't race
            setCards(next);
            saveCards(next);
        },
        [saveCards],
    );

    // Upload the new cards' assets to the cloud in the background, so the cards
    // appear instantly (the bytes are already cached locally and render offline).
    // If an upload is rejected for quota, roll back that card and explain why.
    const syncCreatedAssets = useCallback(
        (createdCards: BoardCardData[], pid: string) => {
            for (const card of createdCards) {
                if (!card.assetId) continue;
                const cardId = card.id;
                void syncAssetToCloud(pid, card.assetId).catch((err) => {
                    if (err instanceof CloudQuotaError) {
                        removeCards(new Set([cardId]));
                        showAssetError(t("storageLimitReached"));
                    } else {
                        console.error("[BoardCanvas] cloud asset upload failed:", err);
                    }
                });
            }
        },
        [removeCards, showAssetError, t],
    );

    // Drop image files → store each in IndexedDB (deduped) and drop an image
    // card referencing its hash at the cursor.
    const handleDrop = useCallback(
        async (e: React.DragEvent) => {
            e.preventDefault();
            setIsDraggingFile(false);
            if (isReadOnly || !projectId) return;

            const files = Array.from(e.dataTransfer.files).filter(
                (f) => f.type.startsWith("image/") || f.type.startsWith("audio/"),
            );
            if (files.length === 0) return;

            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const dropX = (e.clientX - rect.left - offset.x) / scale;
            const dropY = (e.clientY - rect.top - offset.y) / scale;

            const created: BoardCardData[] = [];
            for (const file of files) {
                const i = created.length;
                try {
                    if (file.type.startsWith("audio/")) {
                        const { hash } = await importAudioFile(projectId, file);
                        created.push({
                            id: uuidv7(),
                            type: "audio",
                            assetId: hash,
                            title: "",
                            description: "",
                            color: randomCardColor(),
                            x: dropX + i * 24,
                            y: dropY + i * 24,
                            width: AUDIO_CARD_WIDTH,
                            height: AUDIO_CARD_HEIGHT,
                        });
                        continue;
                    }
                    const { hash, width, height } = await importImageFile(projectId, file);
                    const fit = Math.min(1, MAX_IMAGE_CARD_SIZE / Math.max(width, height, 1));
                    created.push({
                        id: uuidv7(),
                        type: "image",
                        assetId: hash,
                        title: "",
                        description: "",
                        color: "transparent",
                        x: dropX + i * 24,
                        y: dropY + i * 24,
                        width: Math.max(60, Math.round(width * fit)),
                        height: Math.max(60, Math.round(height * fit)),
                    });
                } catch (err) {
                    console.error("[BoardCanvas] Failed to import dropped file:", err);
                }
            }
            if (created.length === 0) return;

            const newCards = [...cardsRef.current, ...created];
            setCards(newCards);
            saveCards(newCards);

            // Upload to the cloud in the background (cards already show locally).
            syncCreatedAssets(created, projectId);
        },
        [isReadOnly, projectId, offset, scale, saveCards, syncCreatedAssets],
    );

    // Create a text card at the given canvas-space coords (from the canvas menu).
    const handleCreateCard = useCallback(
        (x: number, y: number) => {
            setSelectedCardIds(new Set());

            const newCard: BoardCardData = {
                id: uuidv7(),
                title: "",
                description: "",
                color: randomCardColor(),
                x: isSnapping ? Math.round(x / GRID_SIZE) * GRID_SIZE : x,
                y: isSnapping ? Math.round(y / GRID_SIZE) * GRID_SIZE : y,
                width: 450,
                height: 280,
            };

            const newCards = [...cardsRef.current, newCard];
            setCards(newCards);
            saveCards(newCards);
        },
        [isSnapping, saveCards],
    );

    // Begin recording; remember where to drop the resulting card.
    const handleStartRecording = useCallback(
        async (x: number, y: number) => {
            recordCoords.current = { x, y };
            try {
                await recorder.start();
            } catch (err) {
                console.error("[BoardCanvas] Microphone access failed:", err);
            }
        },
        [recorder],
    );

    // Stop recording, store the clip as an asset, and drop an audio card.
    const handleStopRecording = useCallback(async () => {
        const blob = await recorder.stop();
        if (!blob || !projectId) return;
        try {
            const { hash } = await importAudioFile(projectId, blob);
            const { x, y } = recordCoords.current;
            const newCard: BoardCardData = {
                id: uuidv7(),
                type: "audio",
                assetId: hash,
                title: "",
                description: "",
                color: randomCardColor(),
                x,
                y,
                width: AUDIO_CARD_WIDTH,
                height: AUDIO_CARD_HEIGHT,
            };
            const newCards = [...cardsRef.current, newCard];
            setCards(newCards);
            saveCards(newCards);

            // Upload to the cloud in the background (card already shows locally).
            syncCreatedAssets([newCard], projectId);
        } catch (err) {
            console.error("[BoardCanvas] Failed to store recording:", err);
        }
    }, [recorder, projectId, saveCards, syncCreatedAssets]);

    // Import an image file as a card at the given canvas-space coords. Shared by
    // OS file drops and the "Import image" menu action (mobile has no drag-drop).
    const addImageCard = useCallback(
        async (file: File, x: number, y: number) => {
            if (isReadOnly || !projectId) return;
            try {
                const { hash, width, height } = await importImageFile(projectId, file);
                const fit = Math.min(1, MAX_IMAGE_CARD_SIZE / Math.max(width, height, 1));
                const newCard: BoardCardData = {
                    id: uuidv7(),
                    type: "image",
                    assetId: hash,
                    title: "",
                    description: "",
                    color: "transparent",
                    x,
                    y,
                    width: Math.max(60, Math.round(width * fit)),
                    height: Math.max(60, Math.round(height * fit)),
                };
                const newCards = [...cardsRef.current, newCard];
                setCards(newCards);
                saveCards(newCards);
                syncCreatedAssets([newCard], projectId);
            } catch (err) {
                console.error("[BoardCanvas] Failed to import image:", err);
            }
        },
        [isReadOnly, projectId, saveCards, syncCreatedAssets],
    );

    const openImagePicker = useCallback((x: number, y: number) => {
        imageImportCoords.current = { x, y };
        imageInputRef.current?.click();
    }, []);

    const handleImageInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) {
                const { x, y } = imageImportCoords.current;
                void addImageCard(file, x, y);
            }
        },
        [addImageCard],
    );

    // Build the empty-canvas menu (create card / import image / record audio) at
    // the given *screen* coords, resolving the canvas-space drop point via refs.
    const showCanvasMenu = useCallback(
        (screenX: number, screenY: number) => {
            if (isReadOnly) return;
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const canvasX = (screenX - rect.left - offsetRef.current.x) / scaleRef.current;
            const canvasY = (screenY - rect.top - offsetRef.current.y) / scaleRef.current;
            updateContextMenu({
                position: { x: screenX, y: screenY },
                content: (
                    <>
                        <ContextMenuItem
                            icon={Plus}
                            text={t("createCard")}
                            action={() => handleCreateCard(canvasX, canvasY)}
                        />
                        <ContextMenuItem
                            icon={ImageIcon}
                            text={t("importImage")}
                            action={() => openImagePicker(canvasX, canvasY)}
                        />
                        <ContextMenuItem
                            icon={Mic}
                            text={t("recordAudio")}
                            action={() => handleStartRecording(canvasX, canvasY)}
                            disabled={!recorder.isSupported}
                            title={recorder.isSupported ? undefined : t("audioUnsupported")}
                        />
                    </>
                ),
            });
        },
        [isReadOnly, updateContextMenu, t, handleCreateCard, openImagePicker, handleStartRecording, recorder.isSupported],
    );

    // Right-clicking empty canvas opens the menu. Cards and arrows have their own
    // menus, so bail when the click landed on one.
    const handleCanvasContextMenu = useCallback(
        (e: React.MouseEvent) => {
            if (isReadOnly) return;
            const target = e.target as HTMLElement;
            if (
                target.closest(`.${styles.card}`) ||
                target.closest(`.${styles.arrow_group}`) ||
                target.closest("[data-context-menu]") ||
                target.closest(`.${styles.zoom_controls}`)
            )
                return;
            e.preventDefault();
            showCanvasMenu(e.clientX, e.clientY);
        },
        [isReadOnly, showCanvasMenu],
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
                        const isResize =
                            updatedCard.width !== oldCard.width ||
                            updatedCard.height !== oldCard.height;
                        if (!isResize) {
                            const newCards = cards.map((c) => {
                                if (c.id === updatedCard.id) return updatedCard;
                                if (selectedCardIds.has(c.id))
                                    return { ...c, x: c.x + dx, y: c.y + dy };
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
            // Deleting an image card may orphan its asset — reconcile (debounced).
            if (projectId && projectState) scheduleAssetGc(projectId, projectState);
        },
        [cards, arrows, saveCards, saveArrows, projectId, projectState],
    );

    // Change card color
    const handleChangeCardColor = useCallback(
        (id: string, color: string) => {
            const newCards = cards.map((c) => (c.id === id ? { ...c, color } : c));
            setCards(newCards);
            saveCards(newCards);
        },
        [cards, saveCards],
    );

    // Duplicate card
    const handleDuplicateCard = useCallback(
        (card: BoardCardData) => {
            const newCard: BoardCardData = {
                ...card,
                id: uuidv7(),
                x: card.x + 20,
                y: card.y + 20,
            };
            const newCards = [...cards, newCard];
            setCards(newCards);
            saveCards(newCards);
        },
        [cards, saveCards],
    );

    // Send card to the Timeline — to a specific layer when `layerId` is given,
    // otherwise to the default (first root) lane.
    const handleSendToTimeline = useCallback(
        (card: BoardCardData, layerId?: string) => {
            repository?.appendTimelineClip(
                {
                    source: "card",
                    refDocId: docId,
                    refId: card.id,
                    title: card.title,
                    preview: card.description,
                    color: card.color,
                },
                undefined,
                layerId,
            );
        },
        [repository, docId],
    );

    // Timeline layers flattened into display order (depth-annotated), mirroring
    // the Timeline panel's tree so the "Send to timeline" submenu matches it.
    const orderedLayers = useMemo(() => {
        const out: { layer: TimelineLayer; depth: number }[] = [];
        const childrenOf = (parentId: string | null) =>
            Object.values(timelineLayers)
                .filter((l) => (l.parentId ?? null) === parentId)
                .sort((a, b) => a.order - b.order);
        const walk = (parentId: string | null, depth: number) => {
            for (const layer of childrenOf(parentId)) {
                out.push({ layer, depth });
                walk(layer.id, depth + 1);
            }
        };
        walk(null, 0);
        return out;
    }, [timelineLayers]);

    // Delete arrow
    const handleDeleteArrow = useCallback(
        (id: string) => {
            const newArrows = arrows.filter((a) => a.id !== id);
            setArrows(newArrows);
            saveArrows(newArrows);
        },
        [arrows, saveArrows],
    );

    // Open the shared context-menu host for a card.
    const handleCardContextMenu = useCallback(
        (e: React.MouseEvent, card: BoardCardData) => {
            updateContextMenu({
                position: { x: e.clientX, y: e.clientY },
                content: (
                    <>
                        {/* Color applies to text + audio notes; image cards have none. */}
                        {card.type !== "image" && (
                            <>
                                <ContextMenuColorRow
                                    colors={DEFAULT_ITEM_COLORS}
                                    selected={card.color}
                                    onSelect={(color) => handleChangeCardColor(card.id, color)}
                                />
                                <ContextMenuSeparator />
                            </>
                        )}
                        <ContextMenuItem
                            icon={Copy}
                            text={t("duplicate")}
                            action={() => handleDuplicateCard(card)}
                        />
                        {(card.type ?? "text") === "text" &&
                            (orderedLayers.length > 0 ? (
                                <ContextMenuSubmenu icon={ListTree} text={t("sendToTimeline")}>
                                    {orderedLayers.map(({ layer, depth }) => (
                                        <ContextMenuItem
                                            key={layer.id}
                                            icon={Layers}
                                            indent={depth * 14}
                                            text={layer.name || t("untitled")}
                                            action={() => handleSendToTimeline(card, layer.id)}
                                        />
                                    ))}
                                </ContextMenuSubmenu>
                            ) : (
                                <ContextMenuItem
                                    icon={ListTree}
                                    text={t("sendToTimeline")}
                                    action={() => handleSendToTimeline(card)}
                                />
                            ))}
                        <ContextMenuItem
                            icon={Trash2}
                            text={t("delete")}
                            action={() => handleDeleteCard(card.id)}
                        />
                    </>
                ),
            });
        },
        [updateContextMenu, t, handleChangeCardColor, handleDuplicateCard, handleSendToTimeline, handleDeleteCard, orderedLayers],
    );

    // Open the shared context-menu host for an arrow.
    const handleArrowContextMenu = useCallback(
        (e: React.MouseEvent, arrow: BoardArrowData) => {
            e.preventDefault();
            e.stopPropagation();
            updateContextMenu({
                position: { x: e.clientX, y: e.clientY },
                content: (
                    <ContextMenuItem
                        icon={Trash2}
                        text={t("delete")}
                        action={() => handleDeleteArrow(arrow.id)}
                    />
                ),
            });
        },
        [updateContextMenu, t, handleDeleteArrow],
    );

    // Get connection point position for a card
    const getConnectionPoint = useCallback(
        (card: BoardCardData, side: "top" | "right" | "bottom" | "left") => {
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
        },
        [],
    );

    // Calculate best connection points between two cards with perpendicular tangent directions
    const getArrowPoints = useCallback(
        (fromCard: BoardCardData, toCard: BoardCardData) => {
            const fromCenter = {
                x: fromCard.x + fromCard.width / 2,
                y: fromCard.y + fromCard.height / 2,
            };
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
    const handleStartConnection = useCallback(
        (cardId: string, side: string, initialX: number, initialY: number) => {
            setConnectingFrom({ cardId, side });
            setConnectingLine({ x: initialX, y: initialY });
        },
        [],
    );

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
                    id: uuidv7(),
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

    // Setup connection mouse + touch events
    useEffect(() => {
        if (!connectingFrom) return;
        window.addEventListener("mousemove", handleConnectionMouseMove);
        window.addEventListener("mouseup", handleConnectionMouseUp);

        // Touch: track the finger to draw the pending line, and on release resolve
        // the card under the finger via elementFromPoint to complete the link.
        const onTouchMove = (e: TouchEvent) => {
            const t = e.touches[0];
            const container = containerRef.current;
            if (!t || !container) return;
            const rect = container.getBoundingClientRect();
            lastTouchPoint.current = { x: t.clientX, y: t.clientY };
            setConnectingLine({
                x: (t.clientX - rect.left - offsetRef.current.x) / scaleRef.current,
                y: (t.clientY - rect.top - offsetRef.current.y) / scaleRef.current,
            });
        };
        const onTouchEnd = () => {
            const p = lastTouchPoint.current;
            const el = document.elementFromPoint(p.x, p.y) as HTMLElement | null;
            const targetId = el?.closest("[data-card-id]")?.getAttribute("data-card-id");
            if (targetId) handleCompleteConnection(targetId);
            else handleConnectionMouseUp();
        };
        window.addEventListener("touchmove", onTouchMove, { passive: true });
        window.addEventListener("touchend", onTouchEnd);

        return () => {
            window.removeEventListener("mousemove", handleConnectionMouseMove);
            window.removeEventListener("mouseup", handleConnectionMouseUp);
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("touchend", onTouchEnd);
        };
    }, [connectingFrom, handleConnectionMouseMove, handleConnectionMouseUp, handleCompleteConnection]);

    // ── Container touch gestures (mobile) ─────────────────────────────────────
    // One finger pans the canvas; two fingers pinch-zoom (centred on the pinch);
    // a double-tap on empty canvas creates a card; a long-press opens the canvas
    // menu. Cards/handles stop propagation, so their touches never reach here.
    useEffect(
        () => () => {
            if (longPressTimer.current) clearTimeout(longPressTimer.current);
        },
        [],
    );

    const toCanvasPoint = (clientX: number, clientY: number) => {
        const container = containerRef.current;
        if (!container) return { x: 0, y: 0 };
        const rect = container.getBoundingClientRect();
        return {
            x: (clientX - rect.left - offsetRef.current.x) / scaleRef.current,
            y: (clientY - rect.top - offsetRef.current.y) / scaleRef.current,
        };
    };

    const cancelLongPress = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const isChromeTarget = (target: HTMLElement) =>
        !!(
            target.closest(`.${styles.card}`) ||
            target.closest(`.${styles.zoom_controls}`) ||
            target.closest(`.${styles.recording_indicator}`) ||
            target.closest("[data-context-menu]")
        );

    const handleContainerTouchStart = (e: React.TouchEvent) => {
        if (connectingFrom) return;
        if (isChromeTarget(e.target as HTMLElement)) return;

        if (e.touches.length === 1) {
            const t = e.touches[0];
            gesture.current = {
                ...gesture.current,
                mode: "pan",
                startX: t.clientX,
                startY: t.clientY,
                startOffset: { ...offsetRef.current },
                moved: false,
            };
            cancelLongPress();
            const lpX = t.clientX;
            const lpY = t.clientY;
            longPressTimer.current = setTimeout(() => {
                gesture.current.mode = "none";
                showCanvasMenu(lpX, lpY);
            }, 500);
        } else if (e.touches.length === 2) {
            cancelLongPress();
            const a = e.touches[0];
            const b = e.touches[1];
            const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
            const mid = toCanvasPoint((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
            gesture.current = {
                ...gesture.current,
                mode: "pinch",
                startDist: dist || 1,
                startScale: scaleRef.current,
                pinchCanvasX: mid.x,
                pinchCanvasY: mid.y,
                moved: true,
            };
        }
    };

    const handleContainerTouchMove = (e: React.TouchEvent) => {
        const g = gesture.current;
        if (g.mode === "pan" && e.touches.length === 1) {
            const t = e.touches[0];
            const dx = t.clientX - g.startX;
            const dy = t.clientY - g.startY;
            if (!g.moved && Math.hypot(dx, dy) > 8) {
                g.moved = true;
                cancelLongPress();
            }
            if (g.moved) setOffset({ x: g.startOffset.x + dx, y: g.startOffset.y + dy });
        } else if (g.mode === "pinch" && e.touches.length >= 2) {
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const a = e.touches[0];
            const b = e.touches[1];
            const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
            const midX = (a.clientX + b.clientX) / 2;
            const midY = (a.clientY + b.clientY) / 2;
            const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, g.startScale * (dist / g.startDist)));
            setScale(newScale);
            setOffset({
                x: midX - rect.left - g.pinchCanvasX * newScale,
                y: midY - rect.top - g.pinchCanvasY * newScale,
            });
        }
    };

    const handleContainerTouchEnd = (e: React.TouchEvent) => {
        cancelLongPress();
        const g = gesture.current;
        if (g.mode === "pan" && !g.moved && e.changedTouches.length > 0) {
            const t = e.changedTouches[0];
            const now = Date.now();
            const isDoubleTap =
                now - lastTap.current.time < 300 &&
                Math.hypot(t.clientX - lastTap.current.x, t.clientY - lastTap.current.y) < 30;
            if (isDoubleTap) {
                const c = toCanvasPoint(t.clientX, t.clientY);
                setSelectedCardIds(new Set());
                handleCreateCard(c.x, c.y);
                lastTap.current = { time: 0, x: 0, y: 0 };
            } else {
                lastTap.current = { time: now, x: t.clientX, y: t.clientY };
            }
        }
        if (e.touches.length === 0) {
            g.mode = "none";
        } else if (e.touches.length === 1) {
            // A finger lifted from a pinch — resume panning with the one that remains.
            const t = e.touches[0];
            gesture.current = {
                ...g,
                mode: "pan",
                startX: t.clientX,
                startY: t.clientY,
                startOffset: { ...offsetRef.current },
                moved: true,
            };
        }
    };

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
            {/* Hidden picker for the mobile "Import image" menu action. */}
            <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleImageInputChange}
            />
            <div
                ref={containerRef}
                className={`${styles.container} ${isPanning ? styles.panning : ""} ${isDraggingFile ? styles.drag_over : ""}`}
                onMouseDown={isPhone ? undefined : handleContainerMouseDown}
                onDoubleClick={isPhone ? undefined : handleDoubleClick}
                onContextMenu={handleCanvasContextMenu}
                onTouchStart={isPhone ? handleContainerTouchStart : undefined}
                onTouchMove={isPhone ? handleContainerTouchMove : undefined}
                onTouchEnd={isPhone ? handleContainerTouchEnd : undefined}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
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
                            const dist = Math.hypot(
                                points.to.x - points.from.x,
                                points.to.y - points.from.y,
                            );
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
                            const ax1 =
                                points.to.x -
                                arrowLength * Math.cos(angle) +
                                arrowWidth * Math.sin(angle);
                            const ay1 =
                                points.to.y -
                                arrowLength * Math.sin(angle) -
                                arrowWidth * Math.cos(angle);
                            const ax2 =
                                points.to.x -
                                arrowLength * Math.cos(angle) -
                                arrowWidth * Math.sin(angle);
                            const ay2 =
                                points.to.y -
                                arrowLength * Math.sin(angle) +
                                arrowWidth * Math.cos(angle);
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
                                    <path
                                        className={styles.arrow_head}
                                        d={arrowheadD}
                                        fill="var(--secondary-text)"
                                    />
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
                                const dist = Math.hypot(
                                    connectingLine.x - fromPoint.x,
                                    connectingLine.y - fromPoint.y,
                                );
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
                            projectId={projectId}
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

                {/* Transient asset error (e.g. cloud storage limit reached) */}
                {assetError && <div className={styles.asset_error}>{assetError}</div>}

                {/* Recording indicator */}
                {recorder.isRecording && (
                    <div className={styles.recording_indicator}>
                        <span className={styles.recording_dot} />
                        <span className={styles.recording_time}>
                            {formatRecordingTime(recorder.elapsed)}
                        </span>
                        <button className={styles.recording_stop} onClick={handleStopRecording}>
                            <Square size={12} />
                            <span className="unselectable">{t("stopRecording")}</span>
                        </button>
                    </div>
                )}

                {/* Zoom controls hidden on phone — pinch-to-zoom replaces them. */}
                {!isPhone && (
                    <div className={styles.zoom_controls}>
                        <button className={styles.zoom_btn} onClick={() => zoomFromCenter(false)}>
                            <Minus size={14} />
                        </button>
                        <span className={styles.zoom_level}>{Math.round(scale * 100)}%</span>
                        <button className={styles.zoom_btn} onClick={() => zoomFromCenter(true)}>
                            <Plus size={14} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BoardCanvas;
