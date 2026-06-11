"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import styles from "./BoardCanvas.module.css";
import { useTranslations } from "next-intl";
import { Play, Pause } from "lucide-react";
import { BoardCardData } from "@src/lib/project/project-state";
import { useAssetUrl } from "@src/lib/assets/use-asset-url";

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
    const kind = kindOf(card);
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

                onUpdate({ ...card, x: snapToGrid(newX), y: snapToGrid(newY) });
            }

            if (isResizing) {
                const dx = (e.clientX - resizeStart.current.x) / scale;
                const dy = (e.clientY - resizeStart.current.y) / scale;

                const newWidth = Math.max(150, resizeStart.current.width + dx);
                const newHeight = Math.max(minHeightFor(kind), resizeStart.current.height + dy);

                onUpdate({ ...card, width: snapToGrid(newWidth), height: snapToGrid(newHeight) });
            }
        },
        [isDragging, isResizing, kind, card, onUpdate, scale, snapToGrid],
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
            className={cx(
                styles.card,
                kind === "image" && styles.image_card,
                kind === "audio" && styles.audio_card,
                isDragging && styles.card_dragging,
                isConnecting && styles.card_connecting,
                isSelected && styles.card_selected,
            )}
            style={{
                left: card.x,
                top: card.y,
                width: card.width,
                height: card.height,
                ...cardColorStyle(card),
            }}
            onMouseDown={handleMouseDown}
            onMouseUp={handleCardMouseUp}
            onDoubleClick={kind === "text" ? handleStartEditDescription : undefined}
            onContextMenu={handleRightClick}
        >
            {renderBody()}

            <div className={styles.card_resize_handle} onMouseDown={handleResizeStart} />

            {/* Connection handle */}
            <div className={styles.connection_handle} onMouseDown={handleConnectionHandleMouseDown} />
        </div>
    );
};

export default BoardCard;
