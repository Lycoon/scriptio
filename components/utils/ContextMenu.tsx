"use client";

import { ReactNode, useCallback, useRef, useState } from "react";
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

/** Gap kept between a menu and the viewport edges. */
const VIEWPORT_MARGIN = 8;

/** Start offset that keeps an element of `size` inside `viewport` on one axis. */
const clampToViewport = (start: number, size: number, viewport: number) =>
    Math.max(VIEWPORT_MARGIN, Math.min(start, viewport - VIEWPORT_MARGIN - size));

/**
 * Positioned context-menu surface. Renders a fixed panel at `position` and tags
 * it with `data-context-menu` so canvas / outside-click handlers can detect
 * clicks that land inside a menu without depending on hashed CSS-module names.
 *
 * This is purely presentational — it's mounted by the single context-menu host
 * (see editor/sidebar/ContextMenu), which owns the open state, so only one menu
 * is ever rendered.
 */
export const ContextMenu = ({ position, className, children }: ContextMenuProps) => {
    // `position` is the pointer, which can sit anywhere — including close enough
    // to the right/bottom edge that the menu would hang off-screen. Clamp from
    // the measured box in a ref callback (before paint, so the menu is never
    // painted overflowing), and keep watching: menus can grow after opening,
    // e.g. when spellcheck suggestions arrive.
    const place = useCallback(
        (menu: HTMLDivElement | null) => {
            if (!menu) return;
            const apply = () => {
                const { width, height } = menu.getBoundingClientRect();
                menu.style.left = `${clampToViewport(position.x, width, window.innerWidth)}px`;
                menu.style.top = `${clampToViewport(position.y, height, window.innerHeight)}px`;
                menu.style.visibility = "visible";
            };
            apply();
            const observer = new ResizeObserver(apply);
            observer.observe(menu);
            window.addEventListener("resize", apply);
            return () => {
                observer.disconnect();
                window.removeEventListener("resize", apply);
            };
        },
        [position.x, position.y],
    );

    return (
        <div
            ref={place}
            data-context-menu
            className={className ? `${styles.menu} ${className}` : styles.menu}
            // Right-clicking within a menu shouldn't open the native browser menu.
            onContextMenu={(e) => e.preventDefault()}
        >
            {children}
        </div>
    );
};

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

/** `.menu`'s vertical padding — offsets the flyout so its first item lines up
 *  with the parent item rather than sitting a padding-height lower. */
const MENU_PADDING = 6;

/**
 * A menu item that reveals a nested flyout of items on hover. The flyout is a
 * fixed-positioned sibling (tagged `data-context-menu` so canvas/outside-click
 * handlers treat it as part of the menu) — fixed positioning escapes the parent
 * menu's `overflow` clip. It opens to the item's right, flipping left near the
 * viewport edge, and closes when the pointer leaves the item *and* the flyout.
 */
export const ContextMenuSubmenu = ({ text, icon: Icon, children }: ContextMenuSubmenuProps) => {
    const itemRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);

    // Place the flyout from its *measured* box — clamping against a hard-coded
    // size instead made it drift away from the parent item whenever the guess
    // was taller than the panel really is. Done in a ref callback so it runs
    // once the panel is in the DOM but before paint: the panel starts
    // `visibility: hidden` (see the stylesheet) and is revealed once placed.
    const placePanel = useCallback((panel: HTMLDivElement | null) => {
        const item = itemRef.current;
        if (!panel || !item) return;
        const anchor = item.getBoundingClientRect();
        const { width, height } = panel.getBoundingClientRect();
        // Open to the item's right, flipping to its left when that would run off
        // the viewport; both sides are clamped so the flyout stays on-screen.
        const preferredLeft =
            anchor.right + width > window.innerWidth - VIEWPORT_MARGIN ? anchor.left - width : anchor.right;
        panel.style.left = `${clampToViewport(preferredLeft, width, window.innerWidth)}px`;
        panel.style.top = `${clampToViewport(anchor.top - MENU_PADDING, height, window.innerHeight)}px`;
        panel.style.visibility = "visible";
    }, []);

    return (
        <div
            className={styles.submenu_wrap}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            <div ref={itemRef} className={styles.menu_item}>
                <span className={styles.menu_item_icon}>{Icon && <Icon size={16} />}</span>
                <p className="unselectable">{text}</p>
                <ChevronRight size={14} className={styles.submenu_chevron} />
            </div>
            {open && (
                <div ref={placePanel} data-context-menu className={join(styles.menu, styles.submenu_panel)}>
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
