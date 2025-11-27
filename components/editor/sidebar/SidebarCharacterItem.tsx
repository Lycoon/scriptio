import { useContext } from "react";
import { CharacterContextProps, ContextMenuType } from "./ContextMenu";
import { UserContext } from "@src/context/UserContext";
import { pasteText } from "@src/lib/editor/editor";

import { ProjectContext } from "@src/context/ProjectContext";
import { join } from "@src/lib/utils/misc";

import LinkSVG from "@public/images/link.svg";
import item from "./SidebarItem.module.css";

const SidebarCharacterItem = ({ character }: CharacterContextProps) => {
    const { updateContextMenu } = useContext(UserContext);
    const { screenplayEditor } = useContext(ProjectContext);

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
        pasteText(screenplayEditor!, character.name);
    };

    return (
        <div onContextMenu={handleDropdown} onDoubleClick={handleDoubleClick} className={item.container}>
            <div className={item.data}>
                <p className={join(item.title, "unselectable")}>{character.name}</p>
                {character.persistent && <LinkSVG className={item.icon} />}
            </div>
        </div>
    );
};

export default SidebarCharacterItem;
