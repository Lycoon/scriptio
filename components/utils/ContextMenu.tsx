"use client";

import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { join } from "@src/lib/utils/misc";

import styles from "./ContextMenu.module.css";

export interface MenuPosition {
    x: number;
    y: number;
}

interface ContextMenuProps {
    /** Viewport coordinates — the menu is fixed-positioned. */
    position: MenuPosition;
    /** Extra class names on the menu container. */
    className?: string;
    children: ReactNode;
}

/**
 * Positioned context-menu surface. Renders a fixed panel at `position` and tags
 * it with `data-context-menu` so canvas / outside-click handlers can detect
 * clicks that land inside a menu without depending on hashed CSS-module names.
 *
 * This is purely presentational — it's mounted by the single context-menu host
 * (see editor/sidebar/ContextMenu), which owns the open state, so only one menu
 * is ever rendered.
 */
export const ContextMenu = ({ position, className, children }: ContextMenuProps) => (
    <div
        data-context-menu
        className={className ? `${styles.menu} ${className}` : styles.menu}
        style={{ top: position.y, left: position.x }}
        // Right-clicking within a menu shouldn't open the native browser menu.
        onContextMenu={(e) => e.preventDefault()}
    >
        {children}
    </div>
);

interface ContextMenuItemProps {
    text: string;
    action: () => void;
    icon?: LucideIcon;
    disabled?: boolean;
    /** Native tooltip — handy for explaining why a disabled item is disabled. */
    title?: string;
}

export const ContextMenuItem = ({ text, action, icon: Icon, disabled, title }: ContextMenuItemProps) => (
    <div
        onClick={disabled ? undefined : action}
        className={disabled ? styles.menu_item_disabled : styles.menu_item}
        title={title}
    >
        <span className={styles.menu_item_icon}>{Icon && <Icon size={16} />}</span>
        <p className="unselectable">{text}</p>
    </div>
);

export const ContextMenuSeparator = () => <div className={styles.menu_separator} />;

interface ContextMenuColorRowProps {
    colors: string[];
    /** The currently-selected color (gets a highlighted swatch). */
    selected?: string;
    onSelect: (color: string) => void;
}

export const ContextMenuColorRow = ({ colors, selected, onSelect }: ContextMenuColorRowProps) => (
    <div className={styles.colors}>
        {colors.map((color) => (
            <button
                key={color}
                className={join(styles.color_swatch, selected === color ? styles.color_swatch_active : "")}
                style={{ backgroundColor: color }}
                onClick={() => onSelect(color)}
            />
        ))}
    </div>
);
