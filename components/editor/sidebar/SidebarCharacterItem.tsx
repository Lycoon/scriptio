import { useContext } from "react";
import { CharacterContextProps, ContextMenuType } from "./ContextMenu";
import { UserContext } from "@src/context/UserContext";
import { pasteText } from "@src/lib/editor/editor";

import nav_item from "./SidebarItem.module.css";

const SidebarCharacterItem = ({ character }: CharacterContextProps) => {
    const { updateContextMenu, editor } = useContext(UserContext);

    const handleDropdown = (e: any) => {
        e.preventDefault();
        updateContextMenu({
            type: ContextMenuType.CharacterItem,
            position: { x: e.clientX, y: e.clientY },
            typeSpecificProps: {
                character,
            },
        });
    };

    const handleDoubleClick = () => {
        // paste character name on double click
        pasteText(editor!, character.name);
    };

    return (
        <div onContextMenu={handleDropdown} onDoubleClick={handleDoubleClick} className={nav_item.container}>
            <p className={nav_item.title + " unselectable"}>{character.name}</p>
        </div>
    );
};

export default SidebarCharacterItem;
