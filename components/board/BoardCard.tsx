"use client";

import { memo, useRef, useState, useCallback, useEffect } from "react";
import styles from "./BoardCanvas.module.css";
import { useTranslations } from "next-intl";
import { Play, Pause } from "lucide-react";
import { BoardCardData } from "@src/lib/project/project-state";
import { useAssetUrl } from "@src/lib/assets/use-asset-url";
import { useIsPhone } from "@src/lib/utils/hooks";

/** Join truthy class names (false/undefined are skipped). */
const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

/** The card kind, defaulting legacy/undefined cards to plain text notes. */
type CardKind = NonNullable<BoardCardData["type"]>;
const kindOf = (card: BoardCardData): CardKind => card.type ?? "text";

/** Smallest height (canvas px) a card can be resized to, by kind. */
const minHeightFor = (kind: CardKind) => (kind === "audio" ? 76 : 100);

/** Seconds → `m:ss` (clamped at 0), for the audio timer. */
function formatTime(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Inline color for the card chrome. Images are bare; text and audio notes carry
 * a colored header/border like every other card.
 */
function cardColorStyle(card: BoardCardData): React.CSSProperties {
    if (kindOf(card) === "image") return {};
    return { borderColor: card.color, backgroundColor: card.color };
}

// ── Shared inline-editable title ─────────────────────────────────────────────

interface TitleEditing {
    editing: boolean;
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onStartEdit: (e: React.MouseEvent) => void;
}

interface EditableTitleProps extends TitleEditing {
    /** Text shown when not editing (e.g. the title or a placeholder hint). */
    display: string;
    placeholder: string;
    inputClassName: string;
    labelClassName: string;
    /** Optional tooltip on the read-only label. */
    labelTitle?: string;
}

const EditableTitle = ({
    editing,
    value,
    display,
    placeholder,
    inputClassName,
    labelClassName,
    labelTitle,
    onChange,
    onBlur,
    onKeyDown,
    onStartEdit,
}: EditableTitleProps) =>
    editing ? (
        <input
            type="text"
            className={inputClassName}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder={placeholder}
            autoFocus
        />
    ) : (
        <span className={labelClassName} onDoubleClick={onStartEdit} title={labelTitle}>
            {display}
        </span>
    );

// ── Card body variants ───────────────────────────────────────────────────────

const ImageBody = ({ projectId, card }: { projectId: string; card: BoardCardData }) => {
    const imageUrl = useAssetUrl(projectId, card.assetId);
    if (!imageUrl) return <div className={styles.card_image_placeholder} />;
    // Blob object URLs can't be optimized by next/image; a plain <img> is correct here.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" draggable={false} className={styles.card_image} />;
};

const AudioBody = ({
    projectId,
    card,
    title,
}: {
    projectId: string;
    card: BoardCardData;
    title: TitleEditing;
}) => {
    const t = useTranslations("board");
    const assetUrl = useAssetUrl(projectId, card.assetId);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    // MediaRecorder blobs report duration as Infinity until forced to seek past
    // the end; this flag drives the one-shot fix-up below.
    const fixDuration = useRef(false);

    const togglePlay = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) void audio.play();
        else audio.pause();
    }, []);

    const handleLoadedMetadata = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (isFinite(audio.duration)) {
            setDuration(audio.duration);
        } else {
            fixDuration.current = true;
            audio.currentTime = 1e7; // nudge the browser to compute real duration
        }
    }, []);

    const handleTimeUpdate = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (fixDuration.current) {
            fixDuration.current = false;
            setDuration(isFinite(audio.duration) ? audio.duration : 0);
            audio.currentTime = 0;
            setCurrentTime(0);
            return;
        }
        setCurrentTime(audio.currentTime);
    }, []);

    const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = Number(e.target.value);
        if (audioRef.current) audioRef.current.currentTime = value;
        setCurrentTime(value);
    }, []);

    return (
        <>
            <div className={styles.card_header} style={{ backgroundColor: card.color }}>
                <EditableTitle
                    {...title}
                    display={card.title || t("audioHint")}
                    placeholder={t("titlePlaceholder")}
                    inputClassName={styles.card_header_title_input}
                    labelClassName={styles.card_header_title}
                    labelTitle={t("rename")}
                />
            </div>

            <div
                className={styles.audio_content}
                style={{ backgroundColor: `color-mix(in srgb, ${card.color} 20%, white)` }}
            >
                <button
                    className={styles.audio_play_btn}
                    onClick={togglePlay}
                    onMouseDown={(e) => e.stopPropagation()}
                    title={isPlaying ? t("pause") : t("play")}
                    disabled={!assetUrl}
                >
                    {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <span className={styles.audio_time}>
                    {formatTime(duration ? duration - currentTime : 0)}
                </span>
                <input
                    type="range"
                    className={styles.audio_timeline}
                    min={0}
                    max={duration || 0}
                    step={0.01}
                    value={Math.min(currentTime, duration || 0)}
                    onChange={handleSeek}
                    onMouseDown={(e) => e.stopPropagation()}
                    disabled={!assetUrl || !duration}
                    style={
                        {
                            "--audio-progress": `${duration ? (Math.min(currentTime, duration) / duration) * 100 : 0}%`,
                        } as React.CSSProperties
                    }
                />
                {assetUrl && (
                    <audio
                        ref={audioRef}
                        src={assetUrl}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onEnded={() => setIsPlaying(false)}
                        onLoadedMetadata={handleLoadedMetadata}
                        onTimeUpdate={handleTimeUpdate}
                    />
                )}
            </div>
        </>
    );
};

interface DescriptionEditing {
    editing: boolean;
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
}

const TextBody = ({
    card,
    title,
    description,
    onStartEditDescription,
}: {
    card: BoardCardData;
    title: TitleEditing;
    description: DescriptionEditing;
    onStartEditDescription: (e: React.MouseEvent) => void;
}) => {
    const t = useTranslations("board");
    return (
        <>
            <div className={styles.card_header} style={{ backgroundColor: card.color }}>
                <EditableTitle
                    {...title}
                    display={card.title || t("untitled")}
                    placeholder={t("titlePlaceholder")}
                    inputClassName={styles.card_header_title_input}
                    labelClassName={styles.card_header_title}
                />
            </div>

            <div
                className={styles.card_content}
                style={{ backgroundColor: `color-mix(in srgb, ${card.color} 20%, white)` }}
                onDoubleClick={onStartEditDescription}
            >
                <p
                    className={styles.card_description}
                    style={{ display: description.editing ? "none" : undefined }}
                >
                    {card.description}
                </p>
                {description.editing && (
                    <textarea
                        className={styles.card_description_input}
                        value={description.value}
                        onChange={(e) => description.onChange(e.target.value)}
                        onBlur={description.onBlur}
                        onKeyDown={description.onKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        placeholder={t("descriptionPlaceholder")}
                        autoFocus
                    />
                )}
            </div>
        </>
    );
};

// ── Card container (shared chrome: drag, resize, connect, context menu) ───────

interface BoardCardProps {
    card: BoardCardData;
    projectId: string;
    scale: number;
    isSnapping: boolean;
    gridSize: number;
    /**
     * Commit a card change. `transient` marks a frame of a live drag/resize:
     * the board applies it locally but doesn't write it to Yjs (see
     * BoardCanvas.handleUpdateCard). Every gesture ends with one non-transient
     * update, which is the one that gets stored.
     */
    onUpdate: (card: BoardCardData, options?: { transient?: boolean }) => void;
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
    const kind = kindOf(card);
    const isPhone = useIsPhone();
    const cardRef = useRef<HTMLDivElement>(null);
    // Timestamp of the last touch on this card. Touch devices fire a synthesized
    // mousedown/mouseup after a touch; the handles wire *both* pointer types (so
    // resize/link also work with a mouse at mobile widths), and this lets the
    // mouse handlers ignore those synthetic echoes to avoid double-firing.
    const lastTouch = useRef(0);
    const isSyntheticMouse = () => Date.now() - lastTouch.current < 700;
    // Latest card data for touch handlers, which capture their closure at
    // gesture start but must merge against the current card on each update.
    const cardDataRef = useRef(card);
    cardDataRef.current = card;
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
    /**
     * The canvas layer's viewport origin, measured once when a drag starts.
     *
     * Measuring it per move is a `getBoundingClientRect()` right after the card's
     * own style was mutated, which forces a synchronous layout of the entire
     * document — every open sidebar, the timeline, and the parked screenplay
     * editor — on every move event. The canvas cannot pan or zoom while a card is
     * being dragged, so the origin taken at the start holds for the gesture.
     */
    const canvasOrigin = useRef({ left: 0, top: 0 });
    const captureCanvasOrigin = useCallback(() => {
        const parent = cardRef.current?.parentElement;
        if (!parent) return;
        const rect = parent.getBoundingClientRect();
        canvasOrigin.current = { left: rect.left, top: rect.top };
    }, []);
    /**
     * The latest local-only (transient) geometry produced by the gesture in
     * flight, held here rather than read back off the `card` prop so the commit
     * can't miss a final move that hasn't been re-rendered yet. Null when there
     * is nothing left to write.
     */
    const pendingCommit = useRef<BoardCardData | null>(null);

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
            if (
                isEditing ||
                isEditingTitle ||
                (e.target as HTMLElement).closest(`.${styles.card_resize_handle}`)
            )
                return;
            e.stopPropagation();
            e.preventDefault(); // Prevent Chromium's text selection from interfering with drag

            const rect = cardRef.current?.getBoundingClientRect();
            if (!rect) return;

            captureCanvasOrigin();
            dragOffset.current = {
                x: (e.clientX - rect.left) / scale,
                y: (e.clientY - rect.top) / scale,
            };
            setIsDragging(true);
        },
        [isEditing, isEditingTitle, scale, captureCanvasOrigin],
    );

    // Shared drag/resize math, driven by either mouse or touch coordinates.
    const applyDrag = useCallback(
        (clientX: number, clientY: number) => {
            const { left, top } = canvasOrigin.current;
            const newX = (clientX - left) / scale - dragOffset.current.x;
            const newY = (clientY - top) / scale - dragOffset.current.y;
            const next = { ...cardDataRef.current, x: snapToGrid(newX), y: snapToGrid(newY) };
            pendingCommit.current = next;
            onUpdate(next, { transient: true });
        },
        [scale, onUpdate, snapToGrid],
    );

    const applyResize = useCallback(
        (clientX: number, clientY: number) => {
            const dx = (clientX - resizeStart.current.x) / scale;
            const dy = (clientY - resizeStart.current.y) / scale;
            const newWidth = Math.max(150, resizeStart.current.width + dx);
            const newHeight = Math.max(minHeightFor(kind), resizeStart.current.height + dy);
            const next = {
                ...cardDataRef.current,
                width: snapToGrid(newWidth),
                height: snapToGrid(newHeight),
            };
            pendingCommit.current = next;
            onUpdate(next, { transient: true });
        },
        [scale, kind, onUpdate, snapToGrid],
    );

    // End of a drag/resize: write the geometry the gesture landed on to Yjs.
    const commitMove = useCallback(() => {
        const pending = pendingCommit.current;
        if (!pending) return;
        pendingCommit.current = null;
        onUpdate(pending);
    }, [onUpdate]);

    // Flush a gesture cut short by an unmount (the board closed, the document
    // switched) so its last transient move isn't dropped. Goes through a ref so
    // the cleanup runs on unmount only, never on a new `commitMove` identity.
    const commitMoveRef = useRef(commitMove);
    useEffect(() => {
        commitMoveRef.current = commitMove;
    }, [commitMove]);
    useEffect(() => () => commitMoveRef.current(), []);

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (isDragging) applyDrag(e.clientX, e.clientY);
            if (isResizing) applyResize(e.clientX, e.clientY);
        },
        [isDragging, isResizing, applyDrag, applyResize],
    );

    const handleMouseUp = useCallback(() => {
        commitMove();
        setIsDragging(false);
        setIsResizing(false);
    }, [commitMove]);

    const handleResizeStart = useCallback(
        (e: React.MouseEvent) => {
            if (isSyntheticMouse()) return; // ignore the mouse echo of a touch
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

    // ── Touch (mobile) ───────────────────────────────────────────────────────
    // One finger drags the card. A stationary long-press opens the card menu; a
    // tap (no movement) completes a pending connection, or on a second tap enters
    // edit mode. The resize / connection handles get their own touch starters.
    const cardLongPress = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastCardTap = useRef(0);
    const touchDrag = useRef<{ startX: number; startY: number; moved: boolean; suppressed: boolean } | null>(
        null,
    );

    useEffect(
        () => () => {
            if (cardLongPress.current) clearTimeout(cardLongPress.current);
        },
        [],
    );

    const handleCardTouchStart = useCallback(
        (e: React.TouchEvent) => {
            if (isEditing || isEditingTitle) return;
            const target = e.target as HTMLElement;
            if (
                target.closest(`.${styles.card_resize_handle}`) ||
                target.closest(`.${styles.connection_handle}`) ||
                target.closest("input,textarea,button,audio")
            )
                return;
            const t = e.touches[0];
            if (!t) return;
            lastTouch.current = Date.now();
            e.stopPropagation();

            const rect = cardRef.current?.getBoundingClientRect();
            if (!rect) return;
            captureCanvasOrigin();
            dragOffset.current = { x: (t.clientX - rect.left) / scale, y: (t.clientY - rect.top) / scale };
            touchDrag.current = { startX: t.clientX, startY: t.clientY, moved: false, suppressed: false };

            if (cardLongPress.current) clearTimeout(cardLongPress.current);
            const lpX = t.clientX;
            const lpY = t.clientY;
            cardLongPress.current = setTimeout(() => {
                if (touchDrag.current) touchDrag.current.suppressed = true;
                setIsDragging(false);
                onContextMenu(
                    {
                        clientX: lpX,
                        clientY: lpY,
                        preventDefault() {},
                        stopPropagation() {},
                    } as unknown as React.MouseEvent,
                    card,
                );
            }, 500);

            const onMove = (ev: TouchEvent) => {
                const tt = ev.touches[0];
                const state = touchDrag.current;
                if (!tt || !state) return;
                const dx = tt.clientX - state.startX;
                const dy = tt.clientY - state.startY;
                if (!state.moved && Math.hypot(dx, dy) > 8) {
                    state.moved = true;
                    if (cardLongPress.current) {
                        clearTimeout(cardLongPress.current);
                        cardLongPress.current = null;
                    }
                    setIsDragging(true);
                }
                if (state.moved && !state.suppressed) applyDrag(tt.clientX, tt.clientY);
            };
            const onEnd = () => {
                if (cardLongPress.current) {
                    clearTimeout(cardLongPress.current);
                    cardLongPress.current = null;
                }
                window.removeEventListener("touchmove", onMove);
                window.removeEventListener("touchend", onEnd);
                window.removeEventListener("touchcancel", onEnd);
                commitMove();
                setIsDragging(false);
                const state = touchDrag.current;
                touchDrag.current = null;
                if (state && !state.moved && !state.suppressed) {
                    if (isConnecting) {
                        onCompleteConnection(card.id);
                        return;
                    }
                    const now = Date.now();
                    if (now - lastCardTap.current < 300) {
                        lastCardTap.current = 0;
                        if (kind === "text") setIsEditing(true);
                        else if (kind === "audio") setIsEditingTitle(true);
                    } else {
                        lastCardTap.current = now;
                    }
                }
            };
            window.addEventListener("touchmove", onMove, { passive: true });
            window.addEventListener("touchend", onEnd);
            window.addEventListener("touchcancel", onEnd);
        },
        [
            isEditing,
            isEditingTitle,
            scale,
            card,
            kind,
            isConnecting,
            applyDrag,
            commitMove,
            captureCanvasOrigin,
            onContextMenu,
            onCompleteConnection,
        ],
    );

    const handleResizeTouchStart = useCallback(
        (e: React.TouchEvent) => {
            const t = e.touches[0];
            if (!t) return;
            lastTouch.current = Date.now();
            e.stopPropagation();
            resizeStart.current = { x: t.clientX, y: t.clientY, width: card.width, height: card.height };
            setIsResizing(true);
            const onMove = (ev: TouchEvent) => {
                const tt = ev.touches[0];
                if (tt) applyResize(tt.clientX, tt.clientY);
            };
            const onEnd = () => {
                commitMove();
                setIsResizing(false);
                window.removeEventListener("touchmove", onMove);
                window.removeEventListener("touchend", onEnd);
                window.removeEventListener("touchcancel", onEnd);
            };
            window.addEventListener("touchmove", onMove, { passive: true });
            window.addEventListener("touchend", onEnd);
            window.addEventListener("touchcancel", onEnd);
        },
        [card.width, card.height, applyResize, commitMove],
    );

    const handleConnectionTouchStart = useCallback(
        (e: React.TouchEvent) => {
            if (!e.touches[0]) return;
            lastTouch.current = Date.now();
            e.stopPropagation();
            onStartConnection(card.id, "center", card.x + card.width / 2, card.y + card.height / 2);
        },
        [card.id, card.x, card.y, card.width, card.height, onStartConnection],
    );

    const handleStartEditDescription = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(true);
    }, []);

    const handleStartEditTitle = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditingTitle(true);
    }, []);

    const handleTitleBlur = useCallback(() => {
        setIsEditingTitle(false);
        if (localTitle !== card.title) {
            onUpdate({ ...card, title: localTitle });
        }
    }, [card, localTitle, onUpdate]);

    const handleDescriptionBlur = useCallback(() => {
        setIsEditing(false);
        if (localDescription !== card.description) {
            onUpdate({ ...card, description: localDescription });
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
            if (isSyntheticMouse()) return; // ignore the mouse echo of a touch
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
            if (isSyntheticMouse()) return; // ignore the mouse echo of a touch
            if (isConnecting) {
                e.stopPropagation();
                onCompleteConnection(card.id);
            }
        },
        [card.id, isConnecting, onCompleteConnection],
    );

    const titleEditing: TitleEditing = {
        editing: isEditingTitle,
        value: localTitle,
        onChange: setLocalTitle,
        onBlur: handleTitleBlur,
        onKeyDown: handleTitleKeyDown,
        onStartEdit: handleStartEditTitle,
    };

    const renderBody = () => {
        switch (kind) {
            case "image":
                return <ImageBody projectId={projectId} card={card} />;
            case "audio":
                return <AudioBody projectId={projectId} card={card} title={titleEditing} />;
            default:
                return (
                    <TextBody
                        card={card}
                        title={titleEditing}
                        description={{
                            editing: isEditing,
                            value: localDescription,
                            onChange: setLocalDescription,
                            onBlur: handleDescriptionBlur,
                            onKeyDown: handleDescriptionKeyDown,
                        }}
                        onStartEditDescription={handleStartEditDescription}
                    />
                );
        }
    };

    return (
        <div
            ref={cardRef}
            data-card-id={card.id}
            className={cx(
                styles.card,
                kind === "image" && styles.image_card,
                kind === "audio" && styles.audio_card,
                isDragging && styles.card_dragging,
                isConnecting && styles.card_connecting,
                isSelected && styles.card_selected,
            )}
            style={{
                // Position via transform, not left/top — a drag frame is then a
                // compositor translate of this card's own layer instead of
                // layout + repaint inside the canvas layer (see .card).
                transform: `translate3d(${card.x}px, ${card.y}px, 0)`,
                width: card.width,
                height: card.height,
                ...cardColorStyle(card),
            }}
            onMouseDown={isPhone ? undefined : handleMouseDown}
            onMouseUp={handleCardMouseUp}
            onTouchStart={isPhone ? handleCardTouchStart : undefined}
            onDoubleClick={!isPhone && kind === "text" ? handleStartEditDescription : undefined}
            onContextMenu={handleRightClick}
        >
            {renderBody()}

            <div
                className={styles.card_resize_handle}
                onMouseDown={handleResizeStart}
                onTouchStart={isPhone ? handleResizeTouchStart : undefined}
            />

            {/* Connection handle */}
            <div
                className={styles.connection_handle}
                onMouseDown={handleConnectionHandleMouseDown}
                onTouchStart={isPhone ? handleConnectionTouchStart : undefined}
            />
        </div>
    );
};

/**
 * Memoised: a drag emits a transient board update per frame, and without this
 * every card re-rendered on each of those frames. Only the dragged card's
 * `card` prop changes identity, so with the canvas's callbacks kept stable
 * (they read through cardsRef, not the cards state) a drag frame re-renders
 * exactly one card.
 */
export default memo(BoardCard);
