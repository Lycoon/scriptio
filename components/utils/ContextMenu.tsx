"use client";

import { ReactNode, useRef, useState } from "react";
import { ChevronRight, LucideIcon } from "lucide-react";
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
    /** Extra left inset (px) — used to convey nesting in a submenu. */
    indent?: number;
}

export const ContextMenuItem = ({ text, action, icon: Icon, disabled, title, indent }: ContextMenuItemProps) => (
    <div
        onClick={disabled ? undefined : action}
        className={disabled ? styles.menu_item_disabled : styles.menu_item}
        title={title}
        style={indent ? { paddingLeft: 6 + indent } : undefined}
    >
        <span className={styles.menu_item_icon}>{Icon && <Icon size={16} />}</span>
        <p className="unselectable">{text}</p>
    </div>
);

interface ContextMenuSubmenuProps {
    text: string;
    icon?: LucideIcon;
    /** Nested items — revealed in a flyout panel while the parent item is hovered. */
    children: ReactNode;
}

/** Width the flyout is laid out at (matches `.menu`); used for edge-flip math. */
const SUBMENU_WIDTH = 220;

/**
 * A menu item that reveals a nested flyout of items on hover. The flyout is a
 * fixed-positioned sibling (tagged `data-context-menu` so canvas/outside-click
 * handlers treat it as part of the menu) — fixed positioning escapes the parent
 * menu's `overflow` clip. It opens to the item's right, flipping left near the
 * viewport edge, and closes when the pointer leaves the item *and* the flyout.
 */
export const ContextMenuSubmenu = ({ text, icon: Icon, children }: ContextMenuSubmenuProps) => {
    const itemRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    const open = () => {
        const el = itemRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const left = r.right + SUBMENU_WIDTH > window.innerWidth ? r.left - SUBMENU_WIDTH : r.right;
        // Keep the flyout on-screen vertically when it opens near the bottom.
        const top = Math.max(8, Math.min(r.top, window.innerHeight - 320));
        setPos({ top, left });
    };

    return (
        <div className={styles.submenu_wrap} onMouseEnter={open} onMouseLeave={() => setPos(null)}>
            <div ref={itemRef} className={styles.menu_item}>
                <span className={styles.menu_item_icon}>{Icon && <Icon size={16} />}</span>
                <p className="unselectable">{text}</p>
                <ChevronRight size={14} className={styles.submenu_chevron} />
            </div>
            {pos && (
                <div
                    data-context-menu
                    className={join(styles.menu, styles.submenu_panel)}
                    style={{ top: pos.top, left: pos.left }}
                >
                    {children}
                </div>
            )}
        </div>
    );
};

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
