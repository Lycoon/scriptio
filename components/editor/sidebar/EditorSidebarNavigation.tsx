"use client";

import { join } from "@src/lib/utils/misc";
import { useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import { useViewContext } from "@src/context/ViewContext";
import { Scene } from "@src/lib/screenplay/scenes";
import { focusOnPosition } from "@src/lib/screenplay/editor";
import { moveScene } from "@src/lib/screenplay/scene-reorder";
import { computeSceneLabels } from "@src/lib/screenplay/scene-locking";
import { Archive, Clapperboard, FolderTree, MessageSquare } from "lucide-react";
import SidebarSceneItem from "./SidebarSceneItem";
import ShelfSidebarView from "./ShelfSidebarView";
import CommentSidebarView from "./CommentSidebarView";
import DocumentTreeSidebarView from "./DocumentTreeSidebarView";

import form from "./../../utils/Form.module.css";
import sidebar_nav from "./EditorSidebarNavigation.module.css";

// Touch reordering: a swipe scrolls the list, so a scene is only picked up after
// the finger is held roughly still for this long. Moving farther than the cancel
// threshold before then is read as a scroll and abandons the pending pick-up.
const TOUCH_DRAG_HOLD_MS = 300;
const TOUCH_DRAG_CANCEL_PX = 10;

const EditorSidebarNavigation = () => {
    const t = useTranslations("editorSidebar");
    const {
        scenes,
        updateScenes,
        editor,
        sceneLocking,
        sceneNumberingStyle,
        skippedSceneLetters,
        persistentScenes,
    } = useContext(ProjectContext);
    const { leftSidebarOpen } = useViewContext();

    const [activeTab, setActiveTab] = useState<"scenes" | "shelf" | "comments" | "documents">("scenes");

    const [dragIndex, setDragIndex] = useState<number | null>(null);
    // indicatorIndex represents the gap where the item will be inserted.
    // Gap i = "before item i". This way "bottom of item N" and "top of item N+1"
    // both resolve to the same gap (N+1), eliminating visual flicker at separators.
    const [indicatorIndex, setIndicatorIndex] = useState<number | null>(null);

    // Track which scene the cursor is currently in
    const [currentSceneIndex, setCurrentSceneIndex] = useState<number | null>(null);

    // Compute display labels and omitted flags for every scene. When locking is
    // off we fall back to positional numbers so the user always has a number to
    // navigate by.
    const sceneDisplays = useMemo(() => {
        if (sceneLocking) {
            const uuids = scenes.map((s) => s.id ?? "");
            const labels = computeSceneLabels(
                uuids,
                persistentScenes,
                sceneNumberingStyle,
                skippedSceneLetters,
            );
            return scenes.map((_, i) => ({
                label: labels[i]?.label ?? `${i + 1}`,
                isOmitted: labels[i]?.status === "omitted",
            }));
        }
        return scenes.map((_, i) => ({ label: `${i + 1}`, isOmitted: false }));
    }, [scenes, sceneLocking, sceneNumberingStyle, skippedSceneLetters, persistentScenes]);

    const listRef = useRef<HTMLDivElement>(null);
    const currentSceneRef = useRef<HTMLDivElement>(null);
    const scenesRef = useRef(scenes);
    const suppressSceneScrollRef = useRef(false);

    // Touch-drag bookkeeping. The long-press timer arms the pick-up; the abort
    // controller tears down that gesture's window listeners in one shot.
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const gestureAbortRef = useRef<AbortController | null>(null);

    // Keep scenesRef in sync so the editor callback can read the latest scenes
    useEffect(() => {
        scenesRef.current = scenes;
    }, [scenes]);

    // Listen to editor selection changes to track the current scene
    useEffect(() => {
        if (!editor) return;

        const onSelectionUpdate = () => {
            const cursorPos = editor.state.selection.$anchor.pos;
            const currentScenes = scenesRef.current;
            let foundIndex: number | null = null;

            for (let i = 0; i < currentScenes.length; i++) {
                const scene = currentScenes[i];
                if (cursorPos >= scene.position && (scene.nextPosition === -1 || cursorPos < scene.nextPosition)) {
                    foundIndex = i;
                    break;
                }
            }

            setCurrentSceneIndex((prev) => (prev !== foundIndex ? foundIndex : prev));
        };

        editor.on("selectionUpdate", onSelectionUpdate);
        editor.on("update", onSelectionUpdate);

        // Compute initial value
        onSelectionUpdate();

        return () => {
            editor.off("selectionUpdate", onSelectionUpdate);
            editor.off("update", onSelectionUpdate);
        };
    }, [editor]);

    /**
     * Auto-scroll the current scene item into view (suppressed when the user
     * initiated the navigation themselves).
     *
     * Scrolls the list box directly rather than calling `scrollIntoView` on the
     * item. `scrollIntoView` walks *every* scrollable ancestor and, when the
     * inner ones can't bring the target into view, escalates to scrolling the
     * document itself — and with `behavior: "smooth"` that is a running
     * animation, not a one-shot.
     *
     * Both conditions were met here on phone. The drawer is `position: fixed`
     * and, when shut, translated fully off-screen with its contents still
     * rendered (see .collapsed in the stylesheet), so the target could never be
     * revealed and the animation never converged — a scroll left running
     * indefinitely against the shell's window-anchoring guard (see
     * ProjectWorkspace) for no visible reason.
     *
     * Scrolling `listRef` itself cannot touch the document, and the shut-drawer
     * case is skipped outright — there is nothing to reveal, and the effect
     * re-runs when it opens.
     */
    useEffect(() => {
        if (suppressSceneScrollRef.current) {
            suppressSceneScrollRef.current = false;
            return;
        }
        if (!leftSidebarOpen) return;

        const list = listRef.current;
        const item = currentSceneRef.current;
        if (!list || !item) return;

        // Rect-based, not offsetTop: the list establishes no containing block, so
        // the item's offsetParent is some ancestor further up.
        const itemRect = item.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        const delta = itemRect.top - listRect.top - (list.clientHeight - itemRect.height) / 2;
        list.scrollTo({ top: list.scrollTop + delta, behavior: "smooth" });
    }, [currentSceneIndex, leftSidebarOpen]);

    // End any in-progress drag and clear its drop indicator.
    const resetDrag = useCallback(() => {
        setDragIndex(null);
        setIndicatorIndex(null);
    }, []);

    // Desktop drag starts immediately on press; touch is handled by the
    // long-press path below so a swipe can still scroll the list.
    const handlePointerDown = useCallback((index: number, e: React.PointerEvent) => {
        if (e.pointerType === "touch") return;
        if (e.button !== 0) return;
        setDragIndex(index);
    }, []);

    const handleDoubleClick = useCallback((scene: Scene) => {
        if (!editor) return;
        suppressSceneScrollRef.current = true;
        focusOnPosition(editor, scene.position);
    }, [editor]);

    // Resolve the drop gap for a pointer Y. Rects are read live so mid-drag
    // scrolling doesn't cause offset drift. Shared by the mouse and touch paths.
    const updateIndicatorFromY = useCallback((clientY: number) => {
        if (!listRef.current) return;

        const children = listRef.current.children;
        for (let i = 0; i < children.length; i++) {
            const rect = children[i].getBoundingClientRect();
            if (clientY >= rect.top && clientY < rect.bottom) {
                setIndicatorIndex(clientY < rect.top + rect.height / 2 ? i : i + 1);
                return;
            }
        }

        if (children.length === 0) return;
        // Above the first / below the last → drop at the corresponding end.
        if (clientY < children[0].getBoundingClientRect().top) {
            setIndicatorIndex(0);
        } else if (clientY >= children[children.length - 1].getBoundingClientRect().bottom) {
            setIndicatorIndex(children.length);
        }
    }, []);

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (e.pointerType === "touch") return; // touch tracks moves via its own listener
            if (dragIndex === null) return;
            updateIndicatorFromY(e.clientY);
        },
        [dragIndex, updateIndicatorFromY],
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

    // Keep a live handle on handleDrop so the touch listeners — attached once at
    // the start of a gesture — drop with current state, not a stale closure.
    const dropRef = useRef(handleDrop);
    useEffect(() => {
        dropRef.current = handleDrop;
    }, [handleDrop]);

    // Tear down a touch gesture: cancel its pending long-press and remove its
    // window listeners. Shared by the scroll-cancel, the drop, and unmount.
    const stopGesture = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        gestureAbortRef.current?.abort();
        gestureAbortRef.current = null;
    }, []);

    // Touch reordering: hold a scene still to pick it up, then drag to a new
    // position. A move before the hold fires scrolls the list instead. Runs off
    // native touch events (not pointer events) so the active drag can
    // preventDefault to stop the list from scrolling under the finger.
    const handleTouchStart = useCallback(
        (index: number, e: React.TouchEvent) => {
            const touch = e.touches[0];
            if (!touch) return;

            stopGesture(); // abandon any gesture still in flight (e.g. a second finger)

            const drag = { startX: touch.clientX, startY: touch.clientY, active: false };
            const controller = new AbortController();
            gestureAbortRef.current = controller;
            const { signal } = controller;

            longPressTimerRef.current = setTimeout(() => {
                drag.active = true;
                setDragIndex(index);
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
                    // Active drag: block the list scroll and track the drop gap.
                    ev.preventDefault();
                    updateIndicatorFromY(t.clientY);
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
        [stopGesture, updateIndicatorFromY, resetDrag],
    );

    // Abandon any in-flight gesture if the panel unmounts mid-drag.
    useEffect(() => stopGesture, [stopGesture]);

    // Window-level pointerup so the drop works even if cursor leaves the list.
    // Touch drops through its own touchend handler, so ignore touch here to
    // avoid dropping twice (pointerup also fires for touch releases).
    useEffect(() => {
        if (dragIndex === null) return;

        const onPointerUp = (e: PointerEvent) => {
            if (e.pointerType === "touch") return;
            handleDrop();
        };
        window.addEventListener("pointerup", onPointerUp);
        return () => window.removeEventListener("pointerup", onPointerUp);
    }, [dragIndex, handleDrop]);

    return (
        <div className={sidebar_nav.container}>
            <div className={join(sidebar_nav.sidebar_content, !leftSidebarOpen ? sidebar_nav.collapsed : "")}>
                <div className={sidebar_nav.element}>
                    {activeTab === "scenes" ? (
                        <>
                            <div className={sidebar_nav.list_header}>
                                <Clapperboard size={18} />
                                <p className={form.label}>{t("scenes")}</p>
                            </div>
                            <div
                                ref={listRef}
                                className={join(sidebar_nav.list, sidebar_nav.scene_list)}
                                onPointerMove={handlePointerMove}
                            >
                                {scenes.length != 0 ?
                                    scenes.map((scene: Scene, index: number) => {
                                        const isNoOp =
                                            dragIndex === null ||
                                            indicatorIndex === dragIndex ||
                                            indicatorIndex === dragIndex + 1;
                                        const showIndicator = !isNoOp && indicatorIndex === index;
                                        const isCurrent = index === currentSceneIndex;
                                        const display = sceneDisplays[index];
                                        return (
                                            <SidebarSceneItem
                                                key={scene.position}
                                                scrollRef={isCurrent ? currentSceneRef : undefined}
                                                scene={scene}
                                                index={index}
                                                label={display?.label ?? `${index + 1}`}
                                                isOmitted={display?.isOmitted ?? false}
                                                showDropIndicator={showIndicator}
                                                isDragging={dragIndex === index}
                                                isCurrent={isCurrent}
                                                onPointerDown={handlePointerDown}
                                                onTouchStart={handleTouchStart}
                                                onDoubleClick={handleDoubleClick}
                                            />
                                        );
                                    }) : (
                                        <div className={sidebar_nav.empty_state}>
                                            {t("scenesEmpty")}
                                        </div>
                                    )}
                            </div>
                        </>
                    ) : activeTab === "shelf" ? (
                        <ShelfSidebarView />
                    ) : activeTab === "documents" ? (
                        <DocumentTreeSidebarView />
                    ) : (
                        <CommentSidebarView />
                    )}
                    <div className={sidebar_nav.tab_bar}>
                        <button
                            className={join(sidebar_nav.tab_btn, activeTab === "scenes" ? sidebar_nav.tab_btn_active : "")}
                            onClick={() => setActiveTab("scenes")}
                        >
                            <Clapperboard size={16} />
                        </button>
                        <button
                            className={join(sidebar_nav.tab_btn, activeTab === "documents" ? sidebar_nav.tab_btn_active : "")}
                            onClick={() => setActiveTab("documents")}
                        >
                            <FolderTree size={16} />
                        </button>
                        <button
                            className={join(sidebar_nav.tab_btn, activeTab === "comments" ? sidebar_nav.tab_btn_active : "")}
                            onClick={() => setActiveTab("comments")}
                        >
                            <MessageSquare size={16} />
                        </button>
                        <button
                            className={join(sidebar_nav.tab_btn, activeTab === "shelf" ? sidebar_nav.tab_btn_active : "")}
                            onClick={() => setActiveTab("shelf")}
                        >
                            <Archive size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EditorSidebarNavigation;
