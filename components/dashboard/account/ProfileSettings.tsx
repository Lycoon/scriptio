"use client";

import { useEffect, useState } from "react";
import { editUserInfo } from "@src/lib/utils/requests";

import form from "./../../utils/Form.module.css";
import sharedStyles from "../project/ProjectSettings.module.css";
import styles from "./ProfileSettings.module.css";
import { ApiResponse } from "@src/lib/utils/api-utils";
import { useUser } from "@src/lib/utils/hooks";

const PRESET_COLORS = [
    "#ef4444", // red
    "#f97316", // orange
    "#eab308", // yellow
    "#22c55e", // green
    "#14b8a6", // teal
    "#3b82f6", // blue
    "#8b5cf6", // violet
    "#ec4899", // pink
];

const ProfileSettings = () => {
    const { user, mutate } = useUser();

    const [username, setUsername] = useState("");
    const [color, setColor] = useState(PRESET_COLORS[0]);
    const [isDirty, setDirty] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [initialized, setInitialized] = useState(false);

    // Sync state when settings load
    useEffect(() => {
        if (user && !initialized) {
            setUsername(user.username || "");
            setColor(user.color || PRESET_COLORS[0]);
            setInitialized(true);
        }
    }, [user, initialized]);

    const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUsername(e.target.value);
        setDirty(true);
        setMessage(null);
    };

    const handleColorChange = (newColor: string) => {
        setColor(newColor);
        setDirty(true);
        setMessage(null);
    };

    const handleSave = async () => {
        if (!isDirty || loading) return;

        setLoading(true);
        setMessage(null);

        try {
            const res = await editUserInfo({
                username: username.trim() || `User_${Math.floor(Math.random() * 1000)}`,
                color,
            });

            if (res.ok) {
                setMessage({ type: "success", text: "Profile updated successfully" });
                setDirty(false);
                mutate();
            } else {
                const data = (await res.json()) as ApiResponse;
                setMessage({ type: "error", text: data.message || "Failed to update profile" });
            }
        } catch {
            setMessage({ type: "error", text: "An error occurred while saving" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={sharedStyles.settingsForm}>
            {/* Username */}
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>Display Name</label>
                <input
                    type="text"
                    value={username}
                    onChange={handleUsernameChange}
                    className={sharedStyles.input}
                    placeholder="Enter your display name..."
                    maxLength={32}
                />
                <p className={sharedStyles.helpText}>
                    This name will be visible to collaborators when you work on shared projects.
                </p>
            </div>

            {/* Color */}
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>Cursor Color</label>
                <div className={styles.colorSection}>
                    <div className={styles.colorPresets}>
                        {PRESET_COLORS.map((presetColor) => (
                            <button
                                key={presetColor}
                                type="button"
                                className={`${styles.colorPreset} ${color === presetColor ? styles.selected : ""}`}
                                style={{ backgroundColor: presetColor }}
                                onClick={() => handleColorChange(presetColor)}
                                aria-label={`Select color ${presetColor}`}
                            />
                        ))}
                    </div>
                    <div className={styles.customColor}>
                        <input
                            type="color"
                            value={color}
                            onChange={(e) => handleColorChange(e.target.value)}
                            className={styles.colorPicker}
                        />
                        <span className={styles.colorValue}>{color.toUpperCase()}</span>
                    </div>
                </div>
                <p className={sharedStyles.helpText}>
                    Choose a color that represents your cursor when collaborating in real-time.
                </p>
            </div>

            {/* Message */}
            {message && <div className={`${styles.message} ${styles[message.type]}`}>{message.text}</div>}

            <div className={sharedStyles.formActions}>
                <button
                    onClick={handleSave}
                    className={`${sharedStyles.formBtn} ${sharedStyles.success}`}
                    disabled={loading || !isDirty}
                >
                    {loading ? "Saving..." : "Save Changes"}
                </button>
            </div>
        </div>
    );
};

export default ProfileSettings;
