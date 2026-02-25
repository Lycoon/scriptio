"use client";

import { useState } from "react";
import { changePassword } from "@src/lib/utils/requests";

import form from "./../../utils/Form.module.css";
import sharedStyles from "../project/ProjectSettings.module.css";
import styles from "./SecuritySettings.module.css";
import { ApiResponse } from "@src/lib/utils/api-utils";

const MIN_PASSWORD_LENGTH = 8;

const SecuritySettings = () => {
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const isValid = newPassword.length >= MIN_PASSWORD_LENGTH && newPassword === confirmPassword;

    const handleNewPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setNewPassword(e.target.value);
        setMessage(null);
    };

    const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setConfirmPassword(e.target.value);
        setMessage(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!isValid || loading) return;

        setLoading(true);
        setMessage(null);

        try {
            const res = await changePassword({ password: newPassword });
            const data = (await res.json()) as ApiResponse;

            if (res.ok) {
                setMessage({ type: "success", text: data.message || "Password changed successfully" });
                setNewPassword("");
                setConfirmPassword("");
            } else {
                setMessage({ type: "error", text: data.message || "Failed to change password" });
            }
        } catch {
            setMessage({ type: "error", text: "An error occurred while changing password" });
        } finally {
            setLoading(false);
        }
    };

    const getPasswordStrength = (): { label: string; level: number } => {
        if (newPassword.length === 0) return { label: "", level: 0 };
        if (newPassword.length < MIN_PASSWORD_LENGTH) return { label: "Too short", level: 1 };

        let strength = 0;
        if (newPassword.length >= 12) strength++;
        if (/[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword)) strength++;
        if (/\d/.test(newPassword)) strength++;
        if (/[^a-zA-Z0-9]/.test(newPassword)) strength++;

        if (strength <= 1) return { label: "Weak", level: 1 };
        if (strength === 2) return { label: "Fair", level: 2 };
        if (strength === 3) return { label: "Good", level: 3 };
        return { label: "Strong", level: 4 };
    };

    return (
        <form onSubmit={handleSubmit} className={sharedStyles.settingsForm}>
            {/* New Password */}
            <div className={sharedStyles.formGroup}>
                <label htmlFor="new-password" className={form.label}>New Password</label>
                <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={handleNewPasswordChange}
                    className={sharedStyles.input}
                    placeholder="Enter new password..."
                    autoComplete="new-password"
                />
            </div>

            {/* Confirm Password */}
            <div className={sharedStyles.formGroup}>
                <label htmlFor="confirm-password" className={form.label}>Confirm Password</label>
                <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={handleConfirmPasswordChange}
                    className={`${sharedStyles.input} ${
                        confirmPassword.length > 0 && newPassword !== confirmPassword ? styles.inputError : ""
                    }`}
                    placeholder="Confirm new password..."
                    autoComplete="new-password"
                />
                {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                    <p className={styles.errorText}>Passwords do not match</p>
                )}
            </div>

            {/* Message */}
            {message && <div className={`${styles.message} ${styles[message.type]}`}>{message.text}</div>}

            <div className={sharedStyles.formActions}>
                <button type="submit" className={`${sharedStyles.formBtn}`} disabled={loading || !isValid}>
                    {loading ? "Updating..." : "Update Password"}
                </button>
            </div>
        </form>
    );
};

export default SecuritySettings;
