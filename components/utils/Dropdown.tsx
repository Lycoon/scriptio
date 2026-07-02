"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback, ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import styles from "./Dropdown.module.css";

// Layout effect on the client (flash-free positioning), plain effect on the
// server to avoid React's "useLayoutEffect does nothing on the server" warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface DropdownOption {
    value: string;
    label: ReactNode;
    triggerLabel?: ReactNode;
    /** When set, this option is a category whose voices open in a hover submenu. */
    children?: DropdownOption[];
}

interface DropdownProps {
    value: string;
    onChange: (value: string) => void;
    options: DropdownOption[];
    className?: string;
    placeholder?: string;
    /** Let the menu grow to fit its widest option on one line (min: trigger width). */
    fitContent?: boolean;
    /** Render the menu in a body portal so it overflows scrolling/clipping parents. */
    portal?: boolean;
}

/** Recursively find the option matching `value`, descending into submenus. */
const findOption = (options: DropdownOption[], value: string): DropdownOption | undefined => {
    for (const opt of options) {
        if (opt.value === value) return opt;
        const nested = opt.children && findOption(opt.children, value);
        if (nested) return nested;
    }
    return undefined;
};

/** A single menu row — either a leaf (selectable) or a category with a hover submenu. */
const MenuItem = ({
    option,
    value,
    onSelect,
    openValue,
    onOpen,
}: {
    option: DropdownOption;
    value: string;
    onSelect: (value: string) => void;
    /** The category whose submenu is currently open (only one at a time). */
    openValue: string | null;
    onOpen: (value: string | null) => void;
}) => {
    const hasChildren = !!option.children?.length;
    const [flip, setFlip] = useState(false);
    const itemRef = useRef<HTMLDivElement>(null);

    if (!hasChildren) {
        return (
            <div
                className={`${styles.dropdown_item} ${value === option.value ? styles.dropdown_item_active : ""}`}
                onClick={() => onSelect(option.value)}
            >
                <div className={styles.item_content}>{option.label}</div>
            </div>
        );
    }

    const open = openValue === option.value;
    const openSubmenu = () => {
        const r = itemRef.current?.getBoundingClientRect();
        // Open to the left when there isn't room for the flyout on the right.
        if (r) setFlip(r.right + 220 > window.innerWidth);
        onOpen(option.value);
    };
    return (
        <div
            ref={itemRef}
            // Highlight is driven by CSS :hover — which also covers the submenu,
            // since it's a DOM descendant of this row (an ancestor stays :hover).
            className={`${styles.dropdown_item} ${styles.has_submenu} ${open ? styles.submenu_parent_open : ""}`}
            onMouseEnter={openSubmenu}
        >
            <div className={styles.item_content}>{option.label}</div>
            <ChevronRight size={14} className={styles.submenu_arrow} />
            {open && (
                <div className={`${styles.dropdown_menu} ${styles.submenu} ${flip ? styles.submenu_left : ""}`}>
                    {option.children!.map((child) => (
                        <div
                            key={child.value}
                            className={`${styles.dropdown_item} ${value === child.value ? styles.dropdown_item_active : ""}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelect(child.value);
                            }}
                        >
                            <div className={styles.item_content}>{child.label}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const Dropdown = ({
    value,
    onChange,
    options,
    className = "",
    placeholder = "Select...",
    fitContent = false,
    portal = false,
}: DropdownProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

    const updatePos = useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setMenuPos({ top: r.bottom + 8, left: r.left, width: r.width });
    }, []);

    useIsoLayoutEffect(() => {
        if (isOpen && portal) updatePos();
    }, [isOpen, portal, updatePos]);

    // Close on outside click; keep open when clicking the trigger or the menu
    // (the menu may live in a portal, outside the wrapper).
    useEffect(() => {
        if (!isOpen) return;
        const onPointerDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (wrapperRef.current?.contains(target) || menuRef.current?.contains(target)) return;
            setIsOpen(false);
        };
        document.addEventListener("mousedown", onPointerDown);
        return () => document.removeEventListener("mousedown", onPointerDown);
    }, [isOpen]);

    // Keep a portaled menu pinned to the trigger while the panel/list scrolls.
    useEffect(() => {
        if (!isOpen || !portal) return;
        const onMove = () => updatePos();
        window.addEventListener("scroll", onMove, true);
        window.addEventListener("resize", onMove);
        return () => {
            window.removeEventListener("scroll", onMove, true);
            window.removeEventListener("resize", onMove);
        };
    }, [isOpen, portal, updatePos]);

    // Open fresh with no submenu expanded (a stale one would otherwise show
    // without the pointer hovering its category).
    const toggleOpen = () => {
        if (isOpen) {
            setIsOpen(false);
        } else {
            setOpenSubmenu(null);
            setIsOpen(true);
        }
    };

    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
    };

    const selectedOption = findOption(options, value);
    const hasSubmenus = options.some((o) => o.children?.length);

    const menu = (
        <div
            ref={menuRef}
            {...(portal ? { "data-dropdown-portal": "" } : {})}
            className={`${styles.dropdown_menu} ${fitContent ? styles.fit_content : ""} ${hasSubmenus ? styles.has_submenus : ""}`}
            style={
                portal && menuPos
                    ? { position: "fixed", top: menuPos.top, left: menuPos.left, minWidth: menuPos.width }
                    : undefined
            }
            onMouseLeave={hasSubmenus ? () => setOpenSubmenu(null) : undefined}
        >
            {options.map((option) => (
                <MenuItem
                    key={option.value}
                    option={option}
                    value={value}
                    onSelect={handleSelect}
                    openValue={openSubmenu}
                    onOpen={setOpenSubmenu}
                />
            ))}
        </div>
    );

    return (
        <div className={styles.dropdown_wrapper} ref={wrapperRef}>
            <div
                ref={triggerRef}
                className={`${className} ${styles.dropdown_trigger}`}
                onClick={toggleOpen}
            >
                <div className={styles.selected_content}>
                    {selectedOption ? selectedOption.triggerLabel || selectedOption.label : placeholder}
                </div>
                <ChevronDown size={16} className={`${styles.chevron} ${isOpen ? styles.chevron_open : ""}`} />
            </div>

            {isOpen && (portal && typeof document !== "undefined" ? createPortal(menu, document.body) : menu)}
        </div>
    );
};

export default Dropdown;
