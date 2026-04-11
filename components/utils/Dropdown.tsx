"use client";

import { useState, useRef, useEffect, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./Dropdown.module.css";

export interface DropdownOption {
    value: string;
    label: ReactNode;
    triggerLabel?: ReactNode;
}

interface DropdownProps {
    value: string;
    onChange: (value: string) => void;
    options: DropdownOption[];
    className?: string;
    placeholder?: string;
}

const Dropdown = ({ value, onChange, options, className = "", placeholder = "Select..." }: DropdownProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen]);

    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
    };

    const selectedOption = options.find((opt) => opt.value === value);

    return (
        <div className={styles.dropdown_wrapper} ref={dropdownRef}>
            <div
                className={`${className} ${styles.dropdown_trigger}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className={styles.selected_content}>
                    {selectedOption ? (selectedOption.triggerLabel || selectedOption.label) : placeholder}
                </div>
                <ChevronDown size={16} className={`${styles.chevron} ${isOpen ? styles.chevron_open : ""}`} />
            </div>

            {isOpen && (
                <div className={styles.dropdown_menu}>
                    {options.map((option) => (
                        <div
                            key={option.value}
                            className={`${styles.dropdown_item} ${value === option.value ? styles.dropdown_item_active : ""}`}
                            onClick={() => handleSelect(option.value)}
                        >
                            <div className={styles.item_content}>
                                {option.label}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Dropdown;
