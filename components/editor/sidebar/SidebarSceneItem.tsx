import { useContext } from "react";
import { ContextMenuType, SceneContextProps } from "./ContextMenu";
import { UserContext } from "@src/context/UserContext";
import SceneLengthItem from "../sidebar/SceneLengthItem";
import { join } from "@src/lib/utils/misc";

import nav_item from "./SidebarItem.module.css";
import { focusOnPosition } from "@src/lib/editor/editor";
import { ProjectContext } from "@src/context/ProjectContext";

const SidebarSceneItem = ({ scene }: SceneContextProps) => {
    const { updateContextMenu } = useContext(UserContext);
    const { screenplayEditor } = useContext(ProjectContext);

    const handleDropdown = (e: any) => {
        e.preventDefault();
        updateContextMenu({
            type: ContextMenuType.SceneItem,
            position: { x: e.clientX, y: e.clientY },
            typeSpecificProps: {
                position: scene.position,
                nextPosition: scene.nextPosition,
            },
        });
    };

    const handleDoubleClick = () => {
        // focus on double click in scene list
        focusOnPosition(screenplayEditor!, scene.position);
    };

    return (
        <div onContextMenu={handleDropdown} onDoubleClick={handleDoubleClick} className={nav_item.container}>
            <div className={nav_item.header}>
                <p className={join(nav_item.title, "unselectable")}>{scene.title}</p>
                <SceneLengthItem scene={scene} />
            </div>
            <p className={join(nav_item.preview, "unselectable")}>{scene.preview}</p>
        </div>
    );
};

export default SidebarSceneItem;
