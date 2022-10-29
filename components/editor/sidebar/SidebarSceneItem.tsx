import { useContext } from "react";
import { ContextMenuType, SceneContextProps } from "./ContextMenu";
import { UserContext } from "../../../src/context/UserContext";

const SidebarSceneItem = ({
    title,
    position,
    nextPosition,
    focusOn,
    selectTextInEditor,
    cutTextSelection,
}: SceneContextProps) => {
    const { updateContextMenu } = useContext(UserContext);

    const handleDropdown = (e: any) => {
        e.preventDefault();
        updateContextMenu({
            type: ContextMenuType.Scene,
            position: { x: e.clientX, y: e.clientY },
            typeSpecificProps: {
                position,
                nextPosition,
                focusOn,
                selectTextInEditor,
                cutTextSelection,
            },
        });
    };

    const handleDoubleClick = () => {
        focusOn(position); // focus on double click in scene list
    };

    return (
        <div
            onContextMenu={handleDropdown}
            onDoubleClick={handleDoubleClick}
            className="scene-item"
        >
            <p className="scene-item-title unselectable">{title}</p>
        </div>
    );
};

export default SidebarSceneItem;
