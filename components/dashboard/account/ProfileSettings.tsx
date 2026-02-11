"use client";

import { useEffect, useState } from "react";
import { editUserInfo, logout } from "@src/lib/utils/requests";
import { useRouter } from "next/navigation";
import { ArrowRight, Trash2 } from "lucide-react";

import form from "./../../utils/Form.module.css";
import sharedStyles from "../project/ProjectSettings.module.css";
import styles from "./ProfileSettings.module.css";
import dangerStyles from "../project/DangerZone.module.css";
import { ApiResponse } from "@src/lib/utils/api-utils";
import { useUser } from "@src/lib/utils/hooks";

const DELETE_CONFIRMATION_PHRASE = "I confirm my account deletion";

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

const ProfileSettings = ({ dangerOpen, onDangerToggle }: { dangerOpen: boolean; onDangerToggle: () => void }) => {
    const { user, mutate } = useUser();
    const router = useRouter();

    const [username, setUsername] = useState("");
    const [color, setColor] = useState(PRESET_COLORS[0]);
    const [isDirty, setDirty] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [initialized, setInitialized] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
    const [deleteLoading, setDeleteLoading] = useState(false);

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

    const handleDeleteAccount = async () => {
        setDeleteLoading(true);
        try {
            const res = await fetch("/api/users", { method: "DELETE" });
            if (res.ok) {
                await logout();
                router.replace("/login");
            }
        } finally {
            setDeleteLoading(false);
        }
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

    if (dangerOpen) {
        return (
            <>
                <div className={dangerStyles.dangerContainer}>
                    <div className={dangerStyles.dangerItem}>
                        <div>
                            <p className={`${form.label} ${dangerStyles.dangerLabel}`}>Delete account</p>
                            <p className={dangerStyles.dangerDescription}>
                                Permanently delete your account and all associated data. This cannot be undone.
                            </p>
                        </div>
                        <button className={dangerStyles.dangerBtn} onClick={() => setShowDeleteDialog(true)}>
                            Delete
                        </button>
                    </div>
                </div>

                {showDeleteDialog && (
                    <div className={dangerStyles.overlay}>
                        <div className={dangerStyles.modal}>
                            <h2 className={dangerStyles.modalTitle}>Delete account</h2>
                            <p className={dangerStyles.modalDescription}>
                                This will permanently delete your account and all associated data. This action cannot be
                                undone.
                            </p>
                            <p className={dangerStyles.modalDescription}>
                                Type <strong>{DELETE_CONFIRMATION_PHRASE}</strong> to confirm.
                            </p>
                            <input
                                type="text"
                                className={`${sharedStyles.input} ${dangerStyles.modalInput}`}
                                placeholder={DELETE_CONFIRMATION_PHRASE}
                                value={deleteConfirmInput}
                                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                            />
                            <div className={dangerStyles.modalActions}>
                                <button
                                    className={`${dangerStyles.modalBtn} ${dangerStyles.modalBtnDanger}`}
                                    onClick={handleDeleteAccount}
                                    disabled={deleteLoading || deleteConfirmInput !== DELETE_CONFIRMATION_PHRASE}
                                >
                                    <Trash2 size={16} color="#ffffff" />
                                    {deleteLoading ? "Deleting..." : "Delete my account"}
                                </button>
                                <button
                                    className={`${dangerStyles.modalBtn} ${dangerStyles.modalBtnCancel}`}
                                    onClick={() => {
                                        setShowDeleteDialog(false);
                                        setDeleteConfirmInput("");
                                    }}
                                    disabled={deleteLoading}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </>
        );
    }

    return (
        <div className={sharedStyles.settingsForm}>
            {/* Email */}
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>Email</label>
                <input type="email" value={user?.email ?? ""} disabled className={sharedStyles.input} />
            </div>

            {/* Username */}
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>Username</label>
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
                <label className={form.label}>Color</label>
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
                    <div className={styles.colorCustom}>
                        <span className={styles.colorValue}>{color.toUpperCase()}</span>
                        <label
                            className={`${styles.colorPreset} ${styles.customColorSwatch} ${!PRESET_COLORS.includes(color) ? styles.selected : ""}`}
                            style={{ backgroundColor: color }}
                            title="Custom color"
                        >
                            <input
                                type="color"
                                value={color}
                                onChange={(e) => handleColorChange(e.target.value)}
                                className={styles.colorPicker}
                            />
                        </label>
                    </div>
                </div>
            </div>

            {/* Message */}
            {message && <div className={`${styles.message} ${styles[message.type]}`}>{message.text}</div>}

            <div className={sharedStyles.formActions}>
                <button onClick={handleSave} className={`${sharedStyles.formBtn}`} disabled={loading || !isDirty}>
                    {loading ? "Saving..." : "Save Changes"}
                </button>
                <button type="button" className={dangerStyles.arrowBtn} onClick={onDangerToggle} title="Danger zone">
                    <ArrowRight size={16} />
                </button>
            </div>
        </div>
    );
};

export default ProfileSettings;
