"use client";

import { useContext } from "react";
import { ContextMenuType, SceneContextProps } from "./ContextMenu";
import { UserContext } from "@src/context/UserContext";
import { join } from "@src/lib/utils/misc";
import { ProjectContext } from "@src/context/ProjectContext";
import { focusOnPosition } from "@src/lib/screenplay/editor";
import SceneLengthItem from "../sidebar/SceneLengthItem";

import LinkSVG from "@public/images/link.svg";

import nav_item from "./SidebarItem.module.css";

type SidebarSceneItemProps = SceneContextProps & {
    index: number;
    showDropIndicator: boolean;
    isDragging: boolean;
    onPointerDown: (index: number, e: React.PointerEvent) => void;
};

const SidebarSceneItem = ({
    scene,
    index,
    showDropIndicator,
    isDragging,
    onPointerDown,
}: SidebarSceneItemProps) => {
    const { updateContextMenu } = useContext(UserContext);
    const { editor } = useContext(ProjectContext);

    const handleDropdown = (e: any) => {
        e.preventDefault();
        updateContextMenu({
            type: ContextMenuType.SceneItem,
            position: { x: e.clientX, y: e.clientY },
            typeSpecificProps: {
                scene,
            },
        });
    };

    const handleDoubleClick = () => {
        // focus on double click in scene list
        focusOnPosition(editor!, scene.position);
    };

    // Show synopsis if available, otherwise show preview
    const displayText = scene.synopsis || scene.preview;

    const containerClass = join(
        nav_item.container,
        showDropIndicator ? nav_item.drop_indicator_top : "",
        isDragging ? nav_item.dragging : ""
    );

    return (
        <div
            onPointerDown={(e) => onPointerDown(index, e)}
            onContextMenu={handleDropdown}
            onDoubleClick={handleDoubleClick}
            className={containerClass}
        >
            <div className={nav_item.header}>
                <div className={nav_item.title_row}>
                    {scene.color && (
                        <span className={nav_item.color_indicator} style={{ backgroundColor: scene.color }} />
                    )}
                    <p className={join(nav_item.title, "unselectable")}>{scene.title}</p>
                    {/*scene.id && <LinkSVG className={nav_item.icon} />*/}
                </div>
                <SceneLengthItem scene={scene} />
            </div>
            <p className={join(nav_item.preview, "unselectable")}>{displayText}</p>
        </div>
    );
};

export default SidebarSceneItem;
