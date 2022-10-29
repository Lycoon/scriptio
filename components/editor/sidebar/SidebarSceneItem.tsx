import { useContext } from "react";
import { ContextMenuType, SceneContextProps } from "./ContextMenu";
import { UserContext } from "../../../src/context/UserContext";

const SidebarSceneItem = ({ title, position, focusOn }: SceneContextProps) => {
    const { updateContextMenu } = useContext(UserContext);

    const handleDropdown = (e: any) => {
        e.preventDefault();
        updateContextMenu({
            type: ContextMenuType.Scene,
            position: { x: e.clientX, y: e.clientY },
            typeSpecificProps: { position, focusOn },
        });
    };

    const handleDoubleClick = () => {
        focusOn(position);
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
