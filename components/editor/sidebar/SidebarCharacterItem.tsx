import { useContext } from "react";
import { CharacterContextProps, ContextMenuType } from "./ContextMenu";
import { UserContext } from "../../../src/context/UserContext";

const SidebarCharacterItem = ({
    name,
    pasteText,
    replaceOccurrences,
}: CharacterContextProps) => {
    const { updateContextMenu } = useContext(UserContext);

    const handleDropdown = (e: any) => {
        e.preventDefault();
        updateContextMenu({
            type: ContextMenuType.CharacterItem,
            position: { x: e.clientX, y: e.clientY },
            typeSpecificProps: {
                name,
                pasteText,
                replaceOccurrences,
            },
        });
    };

    const handleDoubleClick = () => {
        pasteText(name); // paste character name on double click
    };

    return (
        <div
            onContextMenu={handleDropdown}
            onDoubleClick={handleDoubleClick}
            className="scene-item"
        >
            <p className="scene-item-title unselectable">{name}</p>
        </div>
    );
};

export default SidebarCharacterItem;
