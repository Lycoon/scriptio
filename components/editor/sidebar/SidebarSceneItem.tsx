import { useContext } from "react";
import { ContextMenuType, SceneContextProps } from "./ContextMenu";
import { UserContext } from "@src/context/UserContext";
import SceneLengthItem from "../sidebar/SceneLengthItem";
import { join } from "@src/lib/utils/misc";

import nav_item from "./SidebarItem.module.css";

const SidebarSceneItem = ({
    scene,
    focusOn,
    selectTextInEditor,
    cutTextSelection,
    copyTextSelection,
}: SceneContextProps) => {
    const { updateContextMenu } = useContext(UserContext);

    const handleDropdown = (e: any) => {
        e.preventDefault();
        updateContextMenu({
            type: ContextMenuType.SceneItem,
            position: { x: e.clientX, y: e.clientY },
            typeSpecificProps: {
                position: scene.position,
                nextPosition: scene.nextPosition,
                focusOn,
                selectTextInEditor,
                cutTextSelection,
                copyTextSelection,
            },
        });
    };

    const handleDoubleClick = () => {
        focusOn(scene.position); // focus on double click in scene list
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
