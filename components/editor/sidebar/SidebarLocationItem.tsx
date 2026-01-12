"use client";

import { useContext } from "react";
import { LocationContextProps, ContextMenuType } from "./ContextMenu";
import { UserContext } from "@src/context/UserContext";
import { pasteText } from "@src/lib/screenplay/editor";
import { ProjectContext } from "@src/context/ProjectContext";
import { join } from "@src/lib/utils/misc";

import LinkSVG from "@public/images/link.svg";
import item from "./SidebarItem.module.css";

const SidebarLocationItem = ({ location }: LocationContextProps) => {
    const { updateContextMenu } = useContext(UserContext);
    const { editor } = useContext(ProjectContext);

    const handleDropdown = (e: any) => {
        e.preventDefault();
        updateContextMenu({
            type: ContextMenuType.LocationItem,
            position: { x: e.clientX, y: e.clientY },
            typeSpecificProps: {
                location,
            },
        });
    };

    const handleDoubleClick = () => {
        // paste location name on double click
        if (editor) pasteText(editor, location.name);
    };

    return (
        <div onContextMenu={handleDropdown} onDoubleClick={handleDoubleClick} className={item.container}>
            <div className={item.data}>
                <p className={join(item.title, "unselectable")}>{location.name}</p>
                {location.persistent && <LinkSVG className={item.icon} />}
            </div>
        </div>
    );
};

export default SidebarLocationItem;
