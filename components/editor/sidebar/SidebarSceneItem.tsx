"use client";

import { useContext, memo, useCallback, Ref } from "react";
import { ContextMenuType, SceneContextProps } from "./ContextMenu";
import { UserContext } from "@src/context/UserContext";
import { join } from "@src/lib/utils/misc";
import { Scene } from "@src/lib/screenplay/scenes";
import SceneLengthItem from "../sidebar/SceneLengthItem";

import nav_item from "./SidebarItem.module.css";

type SidebarSceneItemProps = SceneContextProps & {
    index: number;
    showDropIndicator: boolean;
    isDragging: boolean;
    isCurrent: boolean;
    /** Display label for the scene number (e.g. "3", "3A"). */
    label: string;
    /** True when this scene is a locked OMITTED placeholder. */
    isOmitted: boolean;
    scrollRef?: Ref<HTMLDivElement>;
    onPointerDown: (index: number, e: React.PointerEvent) => void;
    onDoubleClick: (scene: Scene) => void;
};

const SidebarSceneItem = memo(({ scene, index, showDropIndicator, isDragging, isCurrent, label, isOmitted, scrollRef, onPointerDown, onDoubleClick }: SidebarSceneItemProps) => {
    const { updateContextMenu } = useContext(UserContext);

    const handleDropdown = (e: React.MouseEvent) => {
        e.preventDefault();
        updateContextMenu({
            type: ContextMenuType.SceneItem,
            position: { x: e.clientX, y: e.clientY },
            typeSpecificProps: {
                scene,
            },
        });
    };

    const handleDoubleClick = useCallback(() => {
        onDoubleClick(scene);
    }, [onDoubleClick, scene]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        onPointerDown(index, e);
    }, [onPointerDown, index]);

    // Show synopsis if available, otherwise show preview
    const displayText = scene.synopsis || scene.preview;
    const titleText = isOmitted ? "OMITTED" : scene.title;

    const containerClass = join(
        nav_item.container,
        showDropIndicator ? nav_item.drop_indicator_top : "",
        isDragging ? nav_item.dragging : "",
        isCurrent ? nav_item.current : "",
    );

    return (
        <div
            ref={scrollRef}
            onPointerDown={handlePointerDown}
            onContextMenu={handleDropdown}
            onDoubleClick={handleDoubleClick}
            className={containerClass}
        >
            <div className={nav_item.header}>
                <div className={nav_item.title_row}>
                    {scene.color && (
                        <span className={nav_item.color_indicator} style={{ backgroundColor: scene.color }} />
                    )}
                    <p className={join(nav_item.title, "unselectable")}>
                        <span className={nav_item.scene_number}>{label}.</span> {titleText}
                    </p>
                </div>
                <SceneLengthItem scene={scene} />
            </div>
            <p className={join(nav_item.preview, "unselectable")}>{displayText}</p>
        </div>
    );
});

SidebarSceneItem.displayName = "SidebarSceneItem";

export default SidebarSceneItem;
