"use client";

import { useContext, memo, useCallback, Ref } from "react";
import { MoreVertical } from "lucide-react";
import { ContextMenuType, SceneContextProps } from "./ContextMenu";
import { UserContext } from "@src/context/UserContext";
import { join } from "@src/lib/utils/misc";
import { useTranslations } from "next-intl";
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
    onTouchStart: (index: number, e: React.TouchEvent) => void;
    onDoubleClick: (scene: Scene) => void;
};

const SidebarSceneItem = memo(({ scene, index, showDropIndicator, isDragging, isCurrent, label, isOmitted, scrollRef, onPointerDown, onTouchStart, onDoubleClick }: SidebarSceneItemProps) => {
    const t = useTranslations("contextMenu");
    const { contextMenu, updateContextMenu } = useContext(UserContext);

    // Clamp so the menu never opens off the right/bottom edge (matters on touch,
    // where it's triggered from the ⋮ button near the panel edge).
    const openMenu = useCallback(
        (x: number, y: number) => {
            updateContextMenu({
                type: ContextMenuType.SceneItem,
                position: {
                    x: Math.min(x, window.innerWidth - 230),
                    y: Math.min(y, window.innerHeight - 220),
                },
                typeSpecificProps: { scene },
            });
        },
        [updateContextMenu, scene],
    );

    const handleDropdown = (e: React.MouseEvent) => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY);
    };

    // Touch equivalent of right-click: the ⋮ button (shown only on coarse
    // pointers). stopPropagation keeps it from starting a drag or, on click,
    // bubbling to the context-menu host's close-on-click handler — which is also
    // why a second tap has to close the menu itself: if this scene's menu is
    // already open, toggle it shut instead of reopening it in place.
    const handleMenuButton = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpenForThis =
            !!contextMenu &&
            "type" in contextMenu &&
            contextMenu.type === ContextMenuType.SceneItem &&
            (contextMenu.typeSpecificProps as SceneContextProps).scene.position === scene.position;
        if (isOpenForThis) {
            updateContextMenu(undefined);
            return;
        }
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        openMenu(rect.left, rect.bottom);
    };

    const handleDoubleClick = useCallback(() => {
        onDoubleClick(scene);
    }, [onDoubleClick, scene]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        onPointerDown(index, e);
    }, [onPointerDown, index]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        onTouchStart(index, e);
    }, [onTouchStart, index]);

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
            onTouchStart={handleTouchStart}
            onContextMenu={handleDropdown}
            onDoubleClick={handleDoubleClick}
            className={containerClass}
        >
            {scene.color && <span className={nav_item.color_bar} style={{ backgroundColor: scene.color }} />}
            <div className={nav_item.header}>
                <div className={nav_item.title_row}>
                    <p className={join(nav_item.title, "unselectable")}>
                        <span className={nav_item.scene_number}>{label}.</span> {titleText}
                    </p>
                </div>
                <SceneLengthItem scene={scene} />
                <button
                    className={nav_item.menu_btn}
                    onPointerDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={handleMenuButton}
                    aria-label={t("sceneOptions")}
                >
                    <MoreVertical size={16} />
                </button>
            </div>
            <p className={join(nav_item.preview, "unselectable")}>{displayText}</p>
        </div>
    );
});

SidebarSceneItem.displayName = "SidebarSceneItem";

export default SidebarSceneItem;
