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

const SidebarSceneItem = ({ scene }: SceneContextProps) => {
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

    return (
        <div onContextMenu={handleDropdown} onDoubleClick={handleDoubleClick} className={nav_item.container}>
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
