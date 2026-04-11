"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ColorPicker.module.css";

const DEFAULT_COLORS = [
    "#ef4444", // red
    "#f97316", // orange
    "#eab308", // yellow
    "#22c55e", // green
    "#06b6d4", // cyan
    "#3b82f6", // blue
    "#8b5cf6", // purple
    "#ec4899", // pink
    "#6b7280", // gray
];

interface ColorPickerProps {
    value: string | undefined;
    onChange: (color: string | undefined) => void;
    colors?: string[];
    allowClear?: boolean;
}

export const ColorPicker = ({ value, onChange, colors = DEFAULT_COLORS, allowClear = true }: ColorPickerProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        window.addEventListener("mousedown", handleClickOutside);
        return () => window.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    const handleColorSelect = (color: string) => {
        onChange(color);
        setIsOpen(false);
    };

    const handleClear = () => {
        onChange(undefined);
        setIsOpen(false);
    };

    return (
        <div className={styles.container} ref={containerRef}>
            <button
                type="button"
                className={`${styles.trigger} ${!value ? styles.trigger_empty : ""}`}
                onClick={() => setIsOpen(!isOpen)}
                style={{ backgroundColor: value || "transparent" }}
            />

            {isOpen && (
                <div className={styles.dropdown}>
                    <div className={styles.colors}>
                        {colors.map((color) => (
                            <button
                                key={color}
                                type="button"
                                className={`${styles.color_option} ${value === color ? styles.selected : ""}`}
                                style={{ backgroundColor: color }}
                                onClick={() => handleColorSelect(color)}
                            />
                        ))}
                        {allowClear && value && (
                            <button
                                type="button"
                                className={styles.clear_option}
                                onClick={handleClear}
                                title="Clear color"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ColorPicker;
