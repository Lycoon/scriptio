"use client";

import { useContext, memo, useCallback } from "react";
import { CharacterContextProps, ContextMenuType } from "./ContextMenu";
import { UserContext } from "@src/context/UserContext";
import { pasteText } from "@src/lib/screenplay/editor";

import { ProjectContext } from "@src/context/ProjectContext";
import { join } from "@src/lib/utils/misc";

import { Highlighter, Link } from "lucide-react";
import item from "./SidebarItem.module.css";

const DEFAULT_HIGHLIGHT_COLOR = "#6366f1"; // Indigo - matches extension default

type SidebarCharacterItemProps = CharacterContextProps & {
    isHighlighted: boolean;
};

const SidebarCharacterItem = memo(({ character, isHighlighted }: SidebarCharacterItemProps) => {
    const { updateContextMenu } = useContext(UserContext);
    const { editor } = useContext(ProjectContext);

    const highlightColor = character.color || DEFAULT_HIGHLIGHT_COLOR;

    const handleDropdown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        updateContextMenu({
            type: ContextMenuType.CharacterItem,
            position: { x: e.clientX, y: e.clientY },
            typeSpecificProps: {
                character,
            },
        });
    }, [updateContextMenu, character]);

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
                </div>
            </div>
        </div>
    );
});

SidebarCharacterItem.displayName = "SidebarCharacterItem";

export default SidebarCharacterItem;
