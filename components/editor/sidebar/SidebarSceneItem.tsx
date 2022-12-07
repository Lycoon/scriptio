import { useContext } from "react";
import { ContextMenuType, SceneContextProps } from "./ContextMenu";
import { UserContext } from "../../../src/context/UserContext";

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
        <div
            onContextMenu={handleDropdown}
            onDoubleClick={handleDoubleClick}
            className="scene-item"
        >
            <p className="scene-item-title unselectable">{scene.title}</p>
            <p className="scene-item-preview unselectable">{scene.preview}</p>
        </div>
    );
};

export default SidebarSceneItem;
