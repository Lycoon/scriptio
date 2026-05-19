"use client";

import styles from "./Switch.module.css";

interface SwitchProps {
    checked: boolean;
    onChange: (next: boolean) => void;
    disabled?: boolean;
    label?: string;
    ariaLabel?: string;
}

const Switch = ({ checked, onChange, disabled, label, ariaLabel }: SwitchProps) => {
    const handleClick = () => {
        if (disabled) return;
        onChange(!checked);
    };

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={ariaLabel ?? label}
            onClick={handleClick}
            disabled={disabled}
            className={`${styles.track} ${checked ? styles.checked : ""} ${disabled ? styles.disabled : ""}`}
        >
            <span className={styles.pip} />
        </button>
    );
};

export default Switch;
