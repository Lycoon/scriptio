"use client";

import { useContext, memo, useCallback } from "react";
import { LocationContextProps, ContextMenuType } from "./ContextMenu";
import { UserContext } from "@src/context/UserContext";
import { pasteText } from "@src/lib/screenplay/editor";
import { ProjectContext } from "@src/context/ProjectContext";
import { join } from "@src/lib/utils/misc";
import { useTranslations } from "next-intl";

import { Link, MoreVertical } from "lucide-react";
import item from "./SidebarItem.module.css";

const SidebarLocationItem = memo(({ location }: LocationContextProps) => {
    const t = useTranslations("contextMenu");
    const { updateContextMenu } = useContext(UserContext);
    const { editor, isReadOnly } = useContext(ProjectContext);

    // Clamp so the menu never opens off the right/bottom edge (matters on touch,
    // where it's triggered from the ⋮ button near the panel edge).
    const openMenu = useCallback(
        (x: number, y: number) => {
            updateContextMenu({
                type: ContextMenuType.LocationItem,
                position: {
                    x: Math.min(x, window.innerWidth - 230),
                    y: Math.min(y, window.innerHeight - 110),
                },
                typeSpecificProps: {
                    location,
                },
            });
        },
        [updateContextMenu, location],
    );

    const handleDropdown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY);
    }, [openMenu]);

    // Touch equivalent of right-click: the ⋮ button (shown only on coarse
    // pointers). stopPropagation keeps the click from bubbling to the
    // context-menu host's close-on-click handler.
    const handleMenuButton = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        openMenu(rect.left, rect.bottom);
    }, [openMenu]);

    const handleDoubleClick = useCallback(() => {
        // paste location name on double click
        if (editor) pasteText(editor, location.name);
    }, [editor, location.name]);

    return (
        <div onContextMenu={handleDropdown} onDoubleClick={handleDoubleClick} className={item.container}>
            <div className={item.data}>
                <div className={item.title_row}>
                    <p className={join(item.title, "unselectable")}>{location.name}</p>
                </div>
                <div className={item.icons_row}>
                    {location.persistent && <Link className={item.icon} size={14} />}
                    {!isReadOnly && (
                        <button
                            className={item.menu_btn}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={handleMenuButton}
                            aria-label={t("locationOptions")}
                        >
                            <MoreVertical size={16} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
});

SidebarLocationItem.displayName = "SidebarLocationItem";

export default SidebarLocationItem;
