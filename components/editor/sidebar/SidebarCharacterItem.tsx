"use client";

import { useContext, memo, useCallback } from "react";
import { CharacterContextProps, ContextMenuType } from "./ContextMenu";
import { UserContext } from "@src/context/UserContext";
import { pasteText } from "@src/lib/screenplay/editor";

import { ProjectContext } from "@src/context/ProjectContext";
import { join } from "@src/lib/utils/misc";
import { useTranslations } from "next-intl";

import { Highlighter, Link, MoreVertical } from "lucide-react";
import item from "./SidebarItem.module.css";

const DEFAULT_HIGHLIGHT_COLOR = "#6366f1"; // Indigo - matches extension default

type SidebarCharacterItemProps = CharacterContextProps & {
    isHighlighted: boolean;
};

const SidebarCharacterItem = memo(({ character, isHighlighted }: SidebarCharacterItemProps) => {
    const t = useTranslations("contextMenu");
    const { updateContextMenu } = useContext(UserContext);
    const { editor, isReadOnly } = useContext(ProjectContext);

    const highlightColor = character.color || DEFAULT_HIGHLIGHT_COLOR;

    // Clamp so the menu never opens off the right/bottom edge (matters on touch,
    // where it's triggered from the ⋮ button near the panel edge). Read-only
    // collapses the menu to the single Highlight item, so it needs far less room.
    const openMenu = useCallback(
        (x: number, y: number) => {
            updateContextMenu({
                type: ContextMenuType.CharacterItem,
                position: {
                    x: Math.min(x, window.innerWidth - 230),
                    y: Math.min(y, window.innerHeight - (isReadOnly ? 60 : 180)),
                },
                typeSpecificProps: {
                    character,
                },
            });
        },
        [updateContextMenu, character, isReadOnly],
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
        // paste character name on double click
        if (editor) pasteText(editor, character.name);
    }, [editor, character.name]);

    return (
        <div onContextMenu={handleDropdown} onDoubleClick={handleDoubleClick} className={item.container}>
            <div className={item.data}>
                <div className={item.title_row}>
                    {character.color && (
                        <span className={item.color_indicator} style={{ backgroundColor: character.color }} />
                    )}
                    <p className={join(item.title, "unselectable")}>{character.name}</p>
                </div>
                <div className={item.icons_row}>
                    {isHighlighted && (
                        <Highlighter size={13} className={item.highlight_icon} style={{ color: highlightColor }} />
                    )}
                    {character.persistent && <Link size={13} className={item.icon} />}
                    {/* Always shown: the character menu keeps a working Highlight
                     * item in read-only, so gating this on write access would put
                     * highlighting out of reach on touch. */}
                    <button
                        className={item.menu_btn}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={handleMenuButton}
                        aria-label={t("characterOptions")}
                    >
                        <MoreVertical size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
});

SidebarCharacterItem.displayName = "SidebarCharacterItem";

export default SidebarCharacterItem;
