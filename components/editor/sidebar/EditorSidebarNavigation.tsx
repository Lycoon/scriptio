"use client";

import { join } from "@src/lib/utils/misc";
import { useContext, useState, useCallback, useRef, useEffect } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { Scene } from "@src/lib/screenplay/scenes";
import { Clapperboard } from "lucide-react";
import SidebarSceneItem from "./SidebarSceneItem";

import form from "./../../utils/Form.module.css";
import sidebar_nav from "./EditorSidebarNavigation.module.css";

const EditorSidebarNavigation = () => {
    const { scenes, updateScenes, editor } = useContext(ProjectContext);
    const { isZenMode } = useContext(UserContext);
    const isActive = isZenMode ? "" : sidebar_nav.active;

    const [dragIndex, setDragIndex] = useState<number | null>(null);
    // indicatorIndex represents the gap where the item will be inserted.
    // Gap i = "before item i". This way "bottom of item N" and "top of item N+1"
    // both resolve to the same gap (N+1), eliminating visual flicker at separators.
    const [indicatorIndex, setIndicatorIndex] = useState<number | null>(null);

    // Track which scene the cursor is currently in
    const [currentSceneIndex, setCurrentSceneIndex] = useState<number | null>(null);

    const listRef = useRef<HTMLDivElement>(null);
    const currentSceneRef = useRef<HTMLDivElement>(null);
    const scenesRef = useRef(scenes);

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

    // Auto-scroll the current scene item into view
    useEffect(() => {
        if (currentSceneRef.current) {
            currentSceneRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [currentSceneIndex]);

    const handlePointerDown = useCallback((index: number, e: React.PointerEvent) => {
        if (e.button !== 0) return;
        setDragIndex(index);
    }, []);

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (dragIndex === null || !listRef.current) return;

            // Read rects live so scrolling doesn't cause offset drift
            const children = listRef.current.children;
            for (let i = 0; i < children.length; i++) {
                const rect = children[i].getBoundingClientRect();
                if (e.clientY >= rect.top && e.clientY < rect.bottom) {
                    const half = e.clientY < rect.top + rect.height / 2 ? "top" : "bottom";
                    setIndicatorIndex(half === "top" ? i : i + 1);
                    return;
                }
            }

            // Below all items → drop after last
            if (children.length > 0) {
                const lastRect = children[children.length - 1].getBoundingClientRect();
                if (e.clientY >= lastRect.bottom) {
                    setIndicatorIndex(children.length);
                }
            }
        },
        [dragIndex],
    );

    const handleDrop = useCallback(() => {
        if (dragIndex === null || indicatorIndex === null || !editor) {
            setDragIndex(null);
            setIndicatorIndex(null);
            return;
        }

        const targetIndex = indicatorIndex;

        // No-op if dropping in original position
        if (targetIndex === dragIndex || targetIndex === dragIndex + 1) {
            setDragIndex(null);
            setIndicatorIndex(null);
            return;
        }

        const dragScene = scenes[dragIndex];
        const from = dragScene.position - 1;
        const to = dragScene.nextPosition - 1;
        const slice = editor.state.doc.slice(from, to);

        const tr = editor.state.tr;
        tr.delete(from, to);

        let insertPos: number;
        if (targetIndex <= dragIndex) {
            insertPos = scenes[targetIndex].position - 1;
        } else {
            // targetIndex can be scenes.length (drop after last item)
            const refPos =
                targetIndex < scenes.length ? scenes[targetIndex].position - 1 : editor.state.doc.content.size;
            insertPos = refPos - (to - from);
        }

        tr.insert(insertPos, slice.content);
        editor.view.dispatch(tr);

        // Optimistically reorder the scenes array so the sidebar updates immediately,
        // before the debounced screenplay observer re-parses with accurate positions.
        const reordered = [...scenes];
        const [moved] = reordered.splice(dragIndex, 1);
        const insertIndex = targetIndex > dragIndex ? targetIndex - 1 : targetIndex;
        reordered.splice(insertIndex, 0, moved);
        updateScenes(reordered);

        setDragIndex(null);
        setIndicatorIndex(null);
    }, [dragIndex, indicatorIndex, scenes, editor, updateScenes]);

    const handleDragEnd = useCallback(() => {
        setDragIndex(null);
        setIndicatorIndex(null);
    }, []);

    // Window-level pointerup so the drop works even if cursor leaves the list
    useEffect(() => {
        if (dragIndex === null) return;

        const onPointerUp = () => handleDrop();
        window.addEventListener("pointerup", onPointerUp);
        return () => window.removeEventListener("pointerup", onPointerUp);
    }, [dragIndex, handleDrop]);

    return (
        <div className={join(sidebar_nav.container, isActive)}>
            <div className={sidebar_nav.element}>
                <div className={sidebar_nav.list_header}>
                    <Clapperboard size={18} />
                    <p className={form.label}>Scenes</p>
                </div>
                <div
                    ref={listRef}
                    className={join(sidebar_nav.list, sidebar_nav.scene_list)}
                    onPointerMove={handlePointerMove}
                >
                    {scenes.length != 0 &&
                        scenes.map((scene: Scene, index: number) => {
                            const isNoOp =
                                dragIndex === null || indicatorIndex === dragIndex || indicatorIndex === dragIndex + 1;
                            const showIndicator = !isNoOp && indicatorIndex === index;
                            const isCurrent = index === currentSceneIndex;
                            return (
                                <SidebarSceneItem
                                    key={scene.position}
                                    scrollRef={isCurrent ? currentSceneRef : undefined}
                                    scene={scene}
                                    index={index}
                                    showDropIndicator={showIndicator}
                                    isDragging={dragIndex === index}
                                    isCurrent={isCurrent}
                                    onPointerDown={handlePointerDown}
                                />
                            );
                        })}
                </div>
            </div>
        </div>
    );
};

export default EditorSidebarNavigation;
