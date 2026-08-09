"use client";

import {
    memo,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
import { ProjectContext } from "@src/context/ProjectContext";
import {
    SCENE_CARD_COLUMNS_MAX,
    SCENE_CARD_COLUMNS_MIN,
    SCENE_CARD_COLUMNS_DEFAULT,
    useViewContext,
} from "@src/context/ViewContext";
import { Scene } from "@src/lib/screenplay/scenes";
import { computeSceneLabels } from "@src/lib/screenplay/scene-locking";
import { moveScene } from "@src/lib/screenplay/scene-reorder";
import { useIsPhone } from "@src/lib/utils/hooks";
import { join } from "@src/lib/utils/misc";

import styles from "./SceneCardsPanel.module.css";

/** Card chrome for a scene with no color of its own (the palette's grey). */
const DEFAULT_SCENE_COLOR = "#6b7280";

// Touch reordering, same shape as the navigation sidebar's: a swipe scrolls the
// grid, so a card is only picked up after the finger is held roughly still for
// this long. Moving farther than the cancel threshold before then is read as a
// scroll and abandons the pending pick-up.
const TOUCH_DRAG_HOLD_MS = 300;
const TOUCH_DRAG_CANCEL_PX = 10;

/**
 * How far a mouse has to travel before a press becomes a drag. Below this a
 * press is still a click — which is what keeps a double-click (to edit) from
 * flashing the lifted card and a drop indicator on its way through.
 */
const MOUSE_DRAG_START_PX = 4;

/**
 * Card scale for a given column count, relative to the 3-per-row default. It is
 * this factor the zoom readout reports, and it drives the card's type and
 * height so that widening a card actually enlarges it rather than just
 * stretching it. Clamped because 1 column across a wide panel is a poster and 5
 * across a narrow one is unreadable.
 */
const cardZoom = (columns: number) => Math.min(2, Math.max(0.6, SCENE_CARD_COLUMNS_DEFAULT / columns));

/** Page count in eighths, matching the sidebar's SceneLengthItem. */
const sceneLength = (scene: Scene) => {
    const totalEighths = Math.max(1, Math.round(((scene.nextPosition - scene.position) / 1100) * 8));
    const fullPages = Math.floor(totalEighths / 8);
    const remainder = totalEighths % 8;
    if (fullPages > 0 && remainder > 0) return `${fullPages}+${remainder}/8 p`;
    return fullPages > 0 ? `${fullPages} p` : `${remainder}/8 p`;
};

/** Which of a card's two fields is being edited in place. */
type EditField = "title" | "synopsis";

type SceneCardProps = {
    scene: Scene;
    index: number;
    label: string;
    isOmitted: boolean;
    /** This card is the one being dragged: it stays as the hole left behind. */
    isSource: boolean;
    /** Rendered as the lifted copy under the pointer — inert, no handlers. */
    isGhost?: boolean;
    /** The scene would be inserted before / after this card on release. */
    showDropBefore: boolean;
    showDropAfter: boolean;
    editField: EditField | null;
    editValue: string;
    canEdit: boolean;
    onEditChange: (value: string) => void;
    onEditCommit: () => void;
    onEditCancel: () => void;
    onStartEdit: (index: number, field: EditField) => void;
    onPointerDown: (index: number, e: React.PointerEvent) => void;
    onTouchStart: (index: number, e: React.TouchEvent) => void;
};

const SceneCard = memo(
    ({
        scene,
        index,
        label,
        isOmitted,
        isSource,
        isGhost = false,
        showDropBefore,
        showDropAfter,
        editField,
        editValue,
        canEdit,
        onEditChange,
        onEditCommit,
        onEditCancel,
        onStartEdit,
        onPointerDown,
        onTouchStart,
    }: SceneCardProps) => {
        const t = useTranslations("popup.scene");
        const color = scene.color || DEFAULT_SCENE_COLOR;
        // Only the synopsis the writer wrote on the scene — never the opening
        // lines of the scene body. An index card carries the intent for a scene,
        // which is a different thing from the first thing said in it.
        const synopsis = scene.synopsis ?? "";

        // Enter commits a heading (it is one line); in the synopsis it is a
        // newline, so only Escape and blur end that edit.
        const handleKeyDown = (e: React.KeyboardEvent, field: EditField) => {
            e.stopPropagation();
            if (e.key === "Escape") onEditCancel();
            else if (e.key === "Enter" && field === "title") {
                e.preventDefault();
                onEditCommit();
            }
        };

        // A double-click inside a field means "edit this", so it must not also
        // reach the card and be read as one of the board-style gestures.
        const startEdit = (e: React.MouseEvent, field: EditField) => {
            if (!canEdit || isGhost) return;
            e.stopPropagation();
            onStartEdit(index, field);
        };

        return (
            // The drop bars are drawn on this wrapper rather than on the card
            // itself: the card clips its own overflow (to round the header's
            // corners into it), which would erase a bar out in the gutter.
            <div
                className={join(
                    styles.card_slot,
                    showDropBefore ? styles.drop_before : "",
                    showDropAfter ? styles.drop_after : "",
                )}
            >
                <div
                    className={join(
                        styles.card,
                        isGhost ? styles.card_ghost : "",
                        isSource && !isGhost ? styles.card_source : "",
                    )}
                    onPointerDown={isGhost ? undefined : (e) => onPointerDown(index, e)}
                    onTouchStart={isGhost ? undefined : (e) => onTouchStart(index, e)}
                >
                    <div className={styles.card_header} style={{ backgroundColor: color }}>
                        {/* The heading keeps its box whether or not it is being edited:
                            the input is laid *over* the text rather than swapped in for
                            it, because the two boxes measure differently (one wraps to
                            two lines, the other never does) and the header would resize
                            under the pointer the moment an edit opened. */}
                        <div className={styles.card_title_slot}>
                            <p
                                className={join(
                                    styles.card_title,
                                    editField === "title" ? styles.card_title_hidden : "",
                                    "unselectable",
                                )}
                                onDoubleClick={(e) => startEdit(e, "title")}
                                title={canEdit && !isOmitted ? t("edit") : undefined}
                            >
                                <span className={styles.scene_number}>{label}.</span>{" "}
                                {isOmitted ? "OMITTED" : scene.title}
                            </p>
                            {editField === "title" && (
                                <input
                                    type="text"
                                    className={styles.card_title_input}
                                    value={editValue}
                                    onChange={(e) => onEditChange(e.target.value)}
                                    onBlur={onEditCommit}
                                    onKeyDown={(e) => handleKeyDown(e, "title")}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    autoFocus
                                />
                            )}
                        </div>
                        <span className={join(styles.card_length, "unselectable")}>{sceneLength(scene)}</span>
                    </div>

                    <div
                        className={styles.card_content}
                        style={{ backgroundColor: `color-mix(in srgb, ${color} 20%, white)` }}
                        onDoubleClick={(e) => startEdit(e, "synopsis")}
                    >
                        {editField === "synopsis" ? (
                            <textarea
                                className={styles.card_synopsis_input}
                                value={editValue}
                                onChange={(e) => onEditChange(e.target.value)}
                                onBlur={onEditCommit}
                                onKeyDown={(e) => handleKeyDown(e, "synopsis")}
                                onPointerDown={(e) => e.stopPropagation()}
                                placeholder={t("synopsisPlaceholder")}
                                autoFocus
                            />
                        ) : (
                            <p
                                className={join(
                                    styles.card_synopsis,
                                    synopsis ? "" : styles.card_synopsis_empty,
                                    "unselectable",
                                )}
                            >
                                {synopsis || t("synopsisPlaceholder")}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    },
);

SceneCard.displayName = "SceneCard";

/** Zoom pill, mirroring the board canvas's — see BoardZoomControls. */
const CardZoomControls = ({
    columns,
    onZoom,
    label,
}: {
    columns: number;
    onZoom: (zoomIn: boolean) => void;
    label: string;
}) => (
    <div className={styles.zoom_controls} aria-label={label}>
        {/* Zooming out fits more cards across, so minus *raises* the column count. */}
        <button
            className={styles.zoom_btn}
            onClick={() => onZoom(false)}
            disabled={columns >= SCENE_CARD_COLUMNS_MAX}
        >
            <Minus size={14} />
        </button>
        <span className={styles.zoom_level}>{Math.round(cardZoom(columns) * 100)}%</span>
        <button
            className={styles.zoom_btn}
            onClick={() => onZoom(true)}
            disabled={columns <= SCENE_CARD_COLUMNS_MIN}
        >
            <Plus size={14} />
        </button>
    </div>
);

/**
 * The screenplay as a wall of scene index cards — heading, synopsis, length and
 * color, in document order, as many to a row as the zoom pill is set to.
 *
 * Dragging a card reorders the *screenplay itself* through the same document
 * transaction the navigation sidebar's drag uses ([moveScene]), so the two
 * surfaces can't disagree about what a reorder means. Double-clicking a heading
 * rewrites that heading in the document; double-clicking the body edits the
 * scene's synopsis, which lives in Yjs beside its color.
 */
const SceneCardsPanel = () => {
    const t = useTranslations("editorSidebar");
    const tNav = useTranslations("navbar");
    const {
        scenes,
        updateScenes,
        editor,
        repository,
        isReadOnly,
        sceneLocking,
        sceneNumberingStyle,
        skippedSceneLetters,
        persistentScenes,
    } = useContext(ProjectContext);
    const { timelineOpen, sceneCardColumns, setSceneCardColumns } = useViewContext();
    const isPhone = useIsPhone();

    const [dragIndex, setDragIndex] = useState<number | null>(null);
    /**
     * The drag has actually been picked up — past the mouse threshold, or the
     * touch long-press has fired. Only then does the lifted card appear and the
     * grid start showing where a drop would land.
     */
    const [isLifted, setIsLifted] = useState(false);
    // The gap the card would land in: gap i means "before card i", and
    // scenes.length means "after the last card" — see moveScene.
    const [indicatorIndex, setIndicatorIndex] = useState<number | null>(null);
    const [editing, setEditing] = useState<{ index: number; field: EditField } | null>(null);
    const [editValue, setEditValue] = useState("");
    /** The grabbed card's size, which the lifted copy is rendered at. */
    const [ghostSize, setGhostSize] = useState({ width: 0, height: 0 });

    const containerRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const ghostRef = useRef<HTMLDivElement>(null);
    /** Where the pointer is, and where inside the card it grabbed. */
    const pointerRef = useRef({ x: 0, y: 0 });
    const grabRef = useRef({ offsetX: 0, offsetY: 0 });
    /** Where the mouse went down, for the drag threshold. */
    const pressOriginRef = useRef({ x: 0, y: 0 });
    /**
     * Card geometry, measured once when the drag is picked up.
     *
     * Reading it per move instead would be a `getBoundingClientRect()` per card
     * per frame, right after the lifted card's inline transform was mutated —
     * which forces a full synchronous layout each time, over a document that
     * still contains the parked screenplay editor. The grid cannot reflow during
     * a drag (the lifted copy is `position: fixed`, the source card keeps its
     * slot, and the drop bar is absolutely positioned), so one measurement holds
     * for the gesture. Scrolling is the one thing that does move the cards, and
     * that is a pure translation the stored scrollTop corrects for.
     */
    const geometryRef = useRef<{ rects: DOMRect[]; scrollTop: number } | null>(null);

    const canEdit = !isReadOnly;
    const columns = Math.min(SCENE_CARD_COLUMNS_MAX, Math.max(SCENE_CARD_COLUMNS_MIN, sceneCardColumns));
    const zoom = cardZoom(columns);

    // Display labels and omitted flags, resolved exactly as the sidebar does so
    // a scene carries the same number in both views. Without production locking
    // there is no frozen number, so positional ones stand in.
    const sceneDisplays = useMemo(() => {
        if (sceneLocking) {
            const uuids = scenes.map((s) => s.id ?? "");
            const labels = computeSceneLabels(uuids, persistentScenes, sceneNumberingStyle, skippedSceneLetters);
            return scenes.map((_, i) => ({
                label: labels[i]?.label ?? `${i + 1}`,
                isOmitted: labels[i]?.status === "omitted",
            }));
        }
        return scenes.map((_, i) => ({ label: `${i + 1}`, isOmitted: false }));
    }, [scenes, sceneLocking, sceneNumberingStyle, skippedSceneLetters, persistentScenes]);

    // ── In-place editing ─────────────────────────────────────────────────────

    const startEdit = useCallback(
        (index: number, field: EditField) => {
            if (!canEdit) return;
            const scene = scenes[index];
            if (!scene) return;

            if (field === "title") {
                // An omitted scene's heading is a placeholder the production lock
                // owns; editing it here would fight scene-locking.
                if (sceneDisplays[index]?.isOmitted) return;
                // Seed from the document rather than scene.title, which has been
                // uppercased for display — committing that back would rewrite the
                // writer's own casing on every edit.
                const node = editor?.state.doc.nodeAt(scene.position - 1);
                setEditValue(node?.textContent ?? scene.title);
            } else {
                setEditValue(scene.synopsis ?? "");
            }
            setEditing({ index, field });
        },
        [canEdit, scenes, sceneDisplays, editor],
    );

    const cancelEdit = useCallback(() => setEditing(null), []);

    const commitEdit = useCallback(() => {
        if (!editing) return;
        const scene = scenes[editing.index];
        setEditing(null);
        if (!scene) return;

        if (editing.field === "synopsis") {
            // Only the synopsis is written — upsertScene merges, so the scene's
            // color and any production-lock fields are left alone.
            if (!repository) return;
            if (!scene.id) {
                // Same limit the scene popup has: persistent scene data is keyed
                // by the heading node's data-id, so a heading without one has
                // nowhere to store a synopsis.
                console.warn("[SceneCardsPanel] Scene id is not available on this node.");
                return;
            }
            const synopsis = editValue.trim();
            if (synopsis === (scene.synopsis ?? "")) return;
            repository.upsertScene(scene.id, { synopsis: synopsis || undefined });
            return;
        }

        if (!editor) return;
        const text = editValue.trim();
        // An empty heading would leave a scene with no way to identify it (and no
        // heading node text for the parser to key on), so treat it as a cancel.
        if (!text) return;

        const nodeStart = scene.position - 1;
        const node = editor.state.doc.nodeAt(nodeStart);
        if (!node) return;
        if (text === node.textContent) return;

        const from = nodeStart + 1;
        editor.view.dispatch(editor.state.tr.insertText(text, from, from + node.content.size));
    }, [editing, editValue, scenes, repository, editor]);

    // A scene list that shrank underneath an open edit (a collaborator's change,
    // a re-parse that dropped the scene) would otherwise leave the input bound to
    // whatever scene now sits at that index. Adjusted during render rather than
    // in an effect — React re-runs the render with the new state before it
    // commits, so no half-rendered frame reaches the screen.
    if (editing && editing.index >= scenes.length) setEditing(null);

    // ── Drag & drop ──────────────────────────────────────────────────────────

    const resetDrag = useCallback(() => {
        setDragIndex(null);
        setIsLifted(false);
        setIndicatorIndex(null);
        geometryRef.current = null;
    }, []);

    /** Park the lifted card under the pointer, offset by where it was grabbed. */
    const positionGhost = useCallback(() => {
        const ghost = ghostRef.current;
        if (!ghost) return;
        const { x, y } = pointerRef.current;
        const { offsetX, offsetY } = grabRef.current;
        // Tilted and slightly enlarged: the card reads as picked up off the wall
        // rather than as a second card that appeared on it.
        ghost.style.transform = `translate3d(${x - offsetX}px, ${y - offsetY}px, 0) rotate(1.5deg) scale(1.03)`;
    }, []);

    // Place it before its first paint, so it never flashes at the origin.
    useLayoutEffect(() => {
        if (isLifted) positionGhost();
    }, [isLifted, positionGhost]);

    const measureCards = useCallback(() => {
        const grid = gridRef.current;
        const scroller = containerRef.current;
        if (!grid) return;
        geometryRef.current = {
            rects: Array.from(grid.children, (child) => child.getBoundingClientRect()),
            scrollTop: scroller?.scrollTop ?? 0,
        };
    }, []);

    /**
     * Resolve the drop gap for a pointer position.
     *
     * A grid gives the pointer two axes to be wrong on, so rather than testing
     * for containment (which leaves the gutters, the padding and the ragged last
     * row unresolved) this takes the card nearest the pointer — rectangle
     * distance, zero when inside — and picks the side of it the pointer is on.
     */
    const updateIndicatorFromPoint = useCallback((clientX: number, clientY: number) => {
        const geometry = geometryRef.current;
        if (!geometry || geometry.rects.length === 0) return;

        // Cards have translated up by however far the grid scrolled since the
        // measurement, so compare against the pointer shifted the same way.
        const scrolled = (containerRef.current?.scrollTop ?? geometry.scrollTop) - geometry.scrollTop;
        const y = clientY + scrolled;

        let nearest = 0;
        let nearestDistance = Infinity;
        for (let i = 0; i < geometry.rects.length; i++) {
            const rect = geometry.rects[i];
            const dx = Math.max(rect.left - clientX, 0, clientX - rect.right);
            const dy = Math.max(rect.top - y, 0, y - rect.bottom);
            const distance = Math.hypot(dx, dy);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = i;
            }
        }

        const rect = geometry.rects[nearest];
        setIndicatorIndex(clientX < rect.left + rect.width / 2 ? nearest : nearest + 1);
    }, []);

    /** Record the grabbed card's geometry so the lifted copy can match it. */
    const captureGrab = useCallback((card: HTMLElement, clientX: number, clientY: number) => {
        const rect = card.getBoundingClientRect();
        grabRef.current = { offsetX: clientX - rect.left, offsetY: clientY - rect.top };
        pointerRef.current = { x: clientX, y: clientY };
        setGhostSize({ width: rect.width, height: rect.height });
    }, []);

    // Desktop drag arms on press but only lifts once the mouse moves; touch goes
    // through the long-press path below so a swipe can still scroll the grid.
    const handlePointerDown = useCallback(
        (index: number, e: React.PointerEvent) => {
            if (e.pointerType === "touch") return;
            if (e.button !== 0) return;
            if (editing) return; // a press inside an open editor is not a drag
            // Keep the press from selecting text across cards while dragging.
            e.preventDefault();
            captureGrab(e.currentTarget as HTMLElement, e.clientX, e.clientY);
            pressOriginRef.current = { x: e.clientX, y: e.clientY };
            setDragIndex(index);
        },
        [editing, captureGrab],
    );

    const handleDrop = useCallback(() => {
        if (dragIndex === null || indicatorIndex === null || !editor) {
            resetDrag();
            return;
        }

        const reordered = moveScene(editor, scenes, dragIndex, indicatorIndex);
        if (reordered) updateScenes(reordered);

        resetDrag();
    }, [dragIndex, indicatorIndex, scenes, editor, updateScenes, resetDrag]);

    // Live handle on handleDrop for the touch listeners, which are attached once
    // at the start of a gesture and would otherwise drop with stale state.
    const dropRef = useRef(handleDrop);
    useEffect(() => {
        dropRef.current = handleDrop;
    }, [handleDrop]);

    // Touch bookkeeping: the long-press timer arms the pick-up, the abort
    // controller tears down that gesture's window listeners in one shot.
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const gestureAbortRef = useRef<AbortController | null>(null);

    const stopGesture = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        gestureAbortRef.current?.abort();
        gestureAbortRef.current = null;
    }, []);

    const handleTouchStart = useCallback(
        (index: number, e: React.TouchEvent) => {
            const touch = e.touches[0];
            if (!touch) return;
            if (editing) return;

            stopGesture(); // abandon any gesture still in flight (e.g. a second finger)

            // currentTarget is cleared once the handler returns, so hold the card
            // itself for the timer that fires after it.
            const card = e.currentTarget as HTMLElement;
            const drag = { startX: touch.clientX, startY: touch.clientY, active: false };
            const controller = new AbortController();
            gestureAbortRef.current = controller;
            const { signal } = controller;

            longPressTimerRef.current = setTimeout(() => {
                drag.active = true;
                captureGrab(card, drag.startX, drag.startY);
                setDragIndex(index);
                setIsLifted(true);
                measureCards();
                updateIndicatorFromPoint(drag.startX, drag.startY);
            }, TOUCH_DRAG_HOLD_MS);

            window.addEventListener(
                "touchmove",
                (ev) => {
                    const t = ev.touches[0];
                    if (!t) return;
                    if (!drag.active) {
                        // Long-press hasn't fired: a real move means the user is
                        // scrolling, so drop the pending pick-up and let it scroll.
                        if (Math.hypot(t.clientX - drag.startX, t.clientY - drag.startY) > TOUCH_DRAG_CANCEL_PX) {
                            stopGesture();
                        }
                        return;
                    }
                    // Active drag: block the grid scroll and track the drop gap.
                    ev.preventDefault();
                    pointerRef.current = { x: t.clientX, y: t.clientY };
                    positionGhost();
                    updateIndicatorFromPoint(t.clientX, t.clientY);
                },
                { passive: false, signal },
            );

            const onEnd = () => {
                const wasActive = drag.active;
                stopGesture();
                if (wasActive) dropRef.current();
                else resetDrag();
            };
            window.addEventListener("touchend", onEnd, { signal });
            window.addEventListener("touchcancel", onEnd, { signal });
        },
        [editing, stopGesture, captureGrab, positionGhost, measureCards, updateIndicatorFromPoint, resetDrag],
    );

    // Abandon any in-flight gesture if the view is switched away mid-drag.
    useEffect(() => stopGesture, [stopGesture]);

    /**
     * The whole mouse drag runs off window listeners rather than the grid's own
     * handlers: a drag that outruns the cursor, leaves the panel, or ends over
     * another element still tracks and still drops. Touch has its own listeners
     * (attached per gesture above) and is ignored here — pointerup fires for
     * touch releases too, which would otherwise drop twice.
     */
    useEffect(() => {
        if (dragIndex === null) return;

        const onPointerMove = (e: PointerEvent) => {
            if (e.pointerType === "touch") return;
            pointerRef.current = { x: e.clientX, y: e.clientY };

            if (!isLifted) {
                const { x, y } = pressOriginRef.current;
                if (Math.hypot(e.clientX - x, e.clientY - y) <= MOUSE_DRAG_START_PX) return;
                // The lifted copy isn't mounted yet, so a layout effect does its
                // first placement; from the next move on, positionGhost does.
                setIsLifted(true);
                measureCards();
            }

            positionGhost();
            updateIndicatorFromPoint(e.clientX, e.clientY);
        };
        const onPointerUp = (e: PointerEvent) => {
            if (e.pointerType === "touch") return;
            // A press that never became a drag is a click, not a drop.
            if (!isLifted) resetDrag();
            else handleDrop();
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        return () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
        };
    }, [dragIndex, isLifted, handleDrop, resetDrag, positionGhost, measureCards, updateIndicatorFromPoint]);

    const handleZoom = useCallback(
        (zoomIn: boolean) => {
            // Zooming in enlarges the cards, which means fitting fewer per row.
            setSceneCardColumns((prev) =>
                Math.min(SCENE_CARD_COLUMNS_MAX, Math.max(SCENE_CARD_COLUMNS_MIN, prev + (zoomIn ? -1 : 1))),
            );
        },
        [setSceneCardColumns],
    );

    // Handed to every card, so it has to keep its identity across renders or the
    // cards' memo() is worthless — a change of drop gap would re-render every
    // card in the screenplay instead of only the two whose bar moved. Its
    // members are all stable through a drag (nothing edits mid-gesture).
    const editProps = useMemo(
        () => ({
            canEdit,
            onEditChange: setEditValue,
            onEditCommit: commitEdit,
            onEditCancel: cancelEdit,
            onStartEdit: startEdit,
            onPointerDown: handlePointerDown,
            onTouchStart: handleTouchStart,
        }),
        [canEdit, commitEdit, cancelEdit, startEdit, handlePointerDown, handleTouchStart],
    );

    const containerClass = join(styles.container, timelineOpen ? styles.timeline_open : "");

    if (scenes.length === 0) {
        return (
            <div className={containerClass}>
                <div className={styles.empty_state}>{t("scenesEmpty")}</div>
            </div>
        );
    }

    // A drop into either gap bordering the dragged card changes nothing, so the
    // indicator is hidden there rather than promising a move that won't happen.
    const showIndicator =
        isLifted && dragIndex !== null && indicatorIndex !== dragIndex && indicatorIndex !== dragIndex + 1;
    const draggedScene = dragIndex !== null ? scenes[dragIndex] : undefined;

    return (
        <>
            <div ref={containerRef} className={join(containerClass, isLifted ? styles.dragging : "")}>
                <div
                    ref={gridRef}
                    className={styles.grid}
                    style={
                        {
                            "--cards-per-row": columns,
                            "--card-zoom": zoom,
                        } as React.CSSProperties
                    }
                >
                    {scenes.map((scene: Scene, index: number) => {
                        const display = sceneDisplays[index];
                        return (
                            <SceneCard
                                key={scene.position}
                                scene={scene}
                                index={index}
                                label={display?.label ?? `${index + 1}`}
                                isOmitted={display?.isOmitted ?? false}
                                isSource={isLifted && dragIndex === index}
                                showDropBefore={showIndicator && indicatorIndex === index}
                                showDropAfter={
                                    showIndicator && index === scenes.length - 1 && indicatorIndex === scenes.length
                                }
                                editField={editing?.index === index ? editing.field : null}
                                editValue={editing?.index === index ? editValue : ""}
                                {...editProps}
                            />
                        );
                    })}
                </div>
            </div>

            {/* The lifted card, following the pointer. Outside the scroll
                container and fixed to the viewport so it doesn't drift when the
                grid scrolls under it mid-drag. */}
            {isLifted && draggedScene && (
                <div
                    ref={ghostRef}
                    className={styles.drag_ghost}
                    style={
                        {
                            width: ghostSize.width,
                            height: ghostSize.height,
                            "--card-zoom": zoom,
                        } as React.CSSProperties
                    }
                >
                    <SceneCard
                        scene={draggedScene}
                        index={dragIndex!}
                        label={sceneDisplays[dragIndex!]?.label ?? `${dragIndex! + 1}`}
                        isOmitted={sceneDisplays[dragIndex!]?.isOmitted ?? false}
                        isSource={false}
                        isGhost
                        showDropBefore={false}
                        showDropAfter={false}
                        editField={null}
                        editValue=""
                        {...editProps}
                    />
                </div>
            )}

            {/* Phones get one card per row regardless (three across 390px is
                unreadable), so there is nothing for the pill to change there —
                the board hides its own on phone for the same reason. */}
            {!isPhone && (
                <CardZoomControls columns={columns} onZoom={handleZoom} label={tNav("viewIndexCards")} />
            )}
        </>
    );
};

export default SceneCardsPanel;
