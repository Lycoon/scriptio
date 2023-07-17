import { useContext } from "react";
import { CharacterContextProps, ContextMenuType } from "./ContextMenu";
import { UserContext } from "@src/context/UserContext";

import nav_item from "./SidebarItem.module.css";

const SidebarCharacterItem = ({
    character,
    pasteText,
    editCharacterPopup,
    removeCharacter,
}: CharacterContextProps) => {
    const { updateContextMenu } = useContext(UserContext);

    const handleDropdown = (e: any) => {
        e.preventDefault();
        updateContextMenu({
            type: ContextMenuType.CharacterItem,
            position: { x: e.clientX, y: e.clientY },
            typeSpecificProps: {
                character,
                pasteText,
                editCharacterPopup,
                removeCharacter,
            },
        });
    };

    const handleDoubleClick = () => {
        pasteText(character.name); // paste character name on double click
    };

    return (
        <div
            onContextMenu={handleDropdown}
            onDoubleClick={handleDoubleClick}
            className={nav_item.container}
        >
            <p className={nav_item.title + " unselectable"}>{character.name}</p>
        </div>
    );
};

export default SidebarCharacterItem;
