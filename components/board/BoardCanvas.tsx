"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { BoardCardData } from "@src/lib/project/project-state";
import { useIsPhone, useIsTouch } from "@src/lib/utils/hooks";
import BoardArrows from "./BoardArrows";
import BoardCard from "./BoardCard";
import {
    BoardToolControls,
    BoardToolHint,
    BoardZoomControls,
    RecordingIndicator,
} from "./BoardOverlays";
import styles from "./BoardCanvas.module.css";
import { BoardTool, GRID_SIZE } from "./board-constants";
import { useBoardMenus } from "./board-menus";
import { useBoardAssets } from "./use-board-assets";
import { useBoardCamera } from "./use-board-camera";
import { useBoardCardActions } from "./use-board-card-actions";
import { useBoardConnections } from "./use-board-connections";
import { useBoardDocument } from "./use-board-document";
import { useBoardSelection } from "./use-board-selection";
import { useBoardTouch } from "./use-board-touch";

/** Delay before framing the board on load, to let the container lay out first. */
const INITIAL_FRAME_DELAY = 50;

/**
 * The corkboard: a pannable, zoomable canvas of cards linked by arrows.
 *
 * Everything with state of its own lives in a hook beside this file — the
 * camera, the Yjs-backed card/arrow document, selection, card actions, media
 * imports, links, touch gestures, menus — and this component wires them
 * together and lays them out.
 */
const BoardCanvas = ({ isVisible, docId }: { isVisible: boolean; docId: string }) => {
    const { projectId, isReadOnly, boardFocusCardId, setBoardFocusCardId } =
        useContext(ProjectContext);
    const containerRef = useRef<HTMLDivElement>(null);

    // isPhone gates *layout* (how much room the chrome has); isTouch gates the
    // *gestures* (pan/pinch/long-press), which a tablet needs just as much as a
    // phone even though it renders the desktop layout.
    const isPhone = useIsPhone();
    const isTouch = useIsTouch();

    const [tool, setTool] = useState<BoardTool>("select");
    /** Grid snapping, held off while Shift is down. */
    const [isSnapping, setIsSnapping] = useState(true);
    /** The board stays hidden until its camera is placed, to avoid a jump on open. */
    const [isCameraReady, setIsCameraReady] = useState(false);

    const [prevIsVisible, setPrevIsVisible] = useState(isVisible);
    if (prevIsVisible !== isVisible) {
        setPrevIsVisible(isVisible);
        if (!isVisible) setIsSnapping(true);
    }

    const camera = useBoardCamera(containerRef);
    const {
        offset,
        scale,
        gridPattern,
        isPanning,
        centerCameraOnCards,
        toCanvasPoint,
        handlePanMouseDown,
        zoomFromCenter,
    } = camera;

    // Frame the board on the cards it opened with, then reveal it.
    const handleFirstLoad = useCallback(
        (loaded: BoardCardData[]) => {
            if (loaded.length === 0) {
                setIsCameraReady(true);
                return;
            }
            setTimeout(() => {
                centerCameraOnCards(loaded);
                setIsCameraReady(true);
            }, INITIAL_FRAME_DELAY);
        },
        [centerCameraOnCards],
    );

    const doc = useBoardDocument(docId, handleFirstLoad);
    const { cards, arrows, removeArrow } = doc;

    const selection = useBoardSelection(camera, doc.getCards);
    const { selectedCardIds, clearSelection, selectionRect, handleSelectionMouseDown } = selection;

    const cardActions = useBoardCardActions(doc, {
        docId,
        isSnapping,
        selectedCardIds,
        clearSelection,
    });
    const { createCard, updateCard } = cardActions;

    const {
        recorder,
        assetError,
        isDraggingFile,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        setImageInput,
        handleImageInputChange,
        openImagePicker,
        startRecording,
        stopRecording,
    } = useBoardAssets(camera, cardActions);

    const {
        connectingFrom,
        connectingLine,
        startConnection,
        completeConnection,
        linkSource,
        clearLinkSource,
        handleLinkTap,
        cutArrowAt,
    } = useBoardConnections(camera, doc);

    const { showCanvasMenu, handleCanvasContextMenu, showCardMenu, showArrowMenu } = useBoardMenus(
        camera,
        {
            canRecord: recorder.isSupported,
            createCard,
            importImage: openImagePicker,
            recordAudio: startRecording,
            changeCardColor: cardActions.changeCardColor,
            duplicateCard: cardActions.duplicateCard,
            sendToTimeline: cardActions.sendToTimeline,
            deleteCard: cardActions.deleteCard,
            deleteArrow: removeArrow,
        },
    );

    const { handleTouchStart, handleTouchMove, handleTouchEnd, isSyntheticMouse } = useBoardTouch({
        camera,
        tool,
        isConnecting: !!connectingFrom,
        onCutAt: cutArrowAt,
        onLongPress: showCanvasMenu,
        onDoubleTap: createCard,
        onCancelLink: clearLinkSource,
    });

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

    // Shift suspends grid snapping; Escape drops the selection.
    useEffect(() => {
        if (!isVisible) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Shift") setIsSnapping(false);
            if (e.key === "Escape") clearSelection();
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === "Shift") setIsSnapping(true);
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [isVisible, clearSelection]);

    /** Arm a tool, or disarm it when it is already the active one. */
    const selectTool = useCallback(
        (next: BoardTool) => {
            setTool((prev) => (prev === next ? "select" : next));
            clearLinkSource();
        },
        [clearLinkSource],
    );

    const handleContainerMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (isSyntheticMouse()) return; // ignore the mouse echo of a touch gesture
            handlePanMouseDown(e);
            handleSelectionMouseDown(e);
        },
        [isSyntheticMouse, handlePanMouseDown, handleSelectionMouseDown],
    );

    // Create a card on double-click.
    const handleDoubleClick = useCallback(
        (e: React.MouseEvent) => {
            if (isSyntheticMouse()) return; // double-tap is handled by the touch hook
            e.preventDefault();
            const target = e.target as HTMLElement;
            if (target.closest(`.${styles.card}`) || target.closest(`.${styles.zoom_controls}`))
                return;
            const { x, y } = toCanvasPoint(e.clientX, e.clientY);
            createCard(x, y);
        },
        [isSyntheticMouse, toCanvasPoint, createCard],
    );

    // Clicking a link with the cut tool armed severs it. The touch path already
    // cut this one, so ignore its mouse echo.
    const handleCutArrow = useCallback(
        (id: string) => {
            if (!isSyntheticMouse()) removeArrow(id);
        },
        [isSyntheticMouse, removeArrow],
    );

    return (
        <div className={styles.board_wrapper}>
            <div className={styles.board_shadow} />
            {/* Hidden picker for the mobile "Import image" menu action. */}
            <input
                ref={setImageInput}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleImageInputChange}
            />
            <div
                ref={containerRef}
                className={`${styles.container} ${isPanning ? styles.panning : ""} ${isDraggingFile ? styles.drag_over : ""}`}
                onMouseDown={handleContainerMouseDown}
                onDoubleClick={handleDoubleClick}
                onContextMenu={handleCanvasContextMenu}
                onTouchStart={isTouch ? handleTouchStart : undefined}
                onTouchMove={isTouch ? handleTouchMove : undefined}
                onTouchEnd={isTouch ? handleTouchEnd : undefined}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div className={styles.grid} style={gridPattern} />

                <div
                    // The resize tool is a pure restyle of every card's corner
                    // grip, so it rides one class on the layer they all sit in —
                    // a per-card prop would re-render the whole board to change
                    // nothing but CSS.
                    className={`${styles.canvas} ${!isCameraReady ? styles.canvas_hidden : ""} ${tool === "resize" ? styles.resize_mode : ""}`}
                    style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
                >
                    <BoardArrows
                        cards={cards}
                        arrows={arrows}
                        cutMode={tool === "cut"}
                        connectingFromCardId={connectingFrom?.cardId ?? null}
                        connectingLine={connectingLine}
                        onArrowContextMenu={showArrowMenu}
                        onCutArrow={handleCutArrow}
                    />

                    {cards.map((card) => (
                        <BoardCard
                            key={card.id}
                            card={card}
                            projectId={projectId}
                            scale={scale}
                            isSnapping={isSnapping}
                            gridSize={GRID_SIZE}
                            onUpdate={updateCard}
                            onContextMenu={showCardMenu}
                            onStartConnection={startConnection}
                            onCompleteConnection={completeConnection}
                            isConnecting={!!connectingFrom}
                            isSelected={selectedCardIds.has(card.id)}
                            linkMode={tool === "link"}
                            isLinkSource={linkSource === card.id}
                            onLinkTap={handleLinkTap}
                        />
                    ))}

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

                {recorder.isRecording && (
                    <RecordingIndicator elapsed={recorder.elapsed} onStop={stopRecording} />
                )}

                {/* Touch tools, hidden in a read-only session where they'd be dead buttons. */}
                {isTouch && !isReadOnly && <BoardToolControls tool={tool} onSelectTool={selectTool} />}
                <BoardToolHint tool={tool} hasLinkSource={!!linkSource} />

                {!isPhone && <BoardZoomControls scale={scale} onZoom={zoomFromCenter} />}
            </div>
        </div>
    );
};

export default BoardCanvas;
