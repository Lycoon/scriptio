"use client";

import { useEffect, useState } from "react";
import { editUserInfo, deleteUser, requestDataExport } from "@src/lib/utils/requests";
import { signOut } from "next-auth/react";
import { isTauri } from "@tauri-apps/api/core";
import { useRouter } from "next/navigation";
import { ArrowRight, Download, Trash2, Save, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import form from "./../../utils/Form.module.css";
import sharedStyles from "../project/ProjectSettings.module.css";
import styles from "./ProfileSettings.module.css";
import dangerStyles from "../project/DangerZone.module.css";
import modal from "../../utils/ModalBtn.module.css";
import { ApiResponse } from "@src/lib/utils/api-utils";
import { useUser } from "@src/lib/utils/hooks";
import { useLocale } from "@src/context/LocaleContext";

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
    const t = useTranslations("profile");
    const tCommon = useTranslations("common");
    const { locale } = useLocale();
    const confirmPhrase = t("deleteConfirmPhrase");

    // A subscription still renewing is money at stake: deleting the account
    // cancels it on the spot, so the dialog has to say so before they confirm.
    // Apple bills through the App Store and we cannot cancel it server-side —
    // that case needs the opposite warning, or the user assumes billing stops.
    const isPro = !!user?.isProUntil && new Date(user.isProUntil) > new Date();
    const hasLiveSubscription = isPro && !user?.isSubscriptionCancelled;
    const isAppleSubscription = user?.subscriptionProvider === "APPLE";
    const proExpiryDate = user?.isProUntil
        ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(
              new Date(user.isProUntil),
          )
        : "";

    const [username, setUsername] = useState("");
    const [color, setColor] = useState(PRESET_COLORS[0]);
    const [isDirty, setDirty] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [initialized, setInitialized] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [exportLoading, setExportLoading] = useState(false);
    const [exportMessage, setExportMessage] = useState<{ type: "success" | "error"; text: string } | null>(
        null,
    );

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

    // GDPR data-access request: the server bundles everything in the background
    // and emails a download link, so the only feedback here is "check your inbox".
    const handleRequestExport = async () => {
        if (exportLoading) return;
        setExportLoading(true);
        setExportMessage(null);
        try {
            const res = await requestDataExport();
            if (res.ok) {
                setExportMessage({ type: "success", text: t("exportRequested") });
            } else if (res.status === 409) {
                setExportMessage({ type: "error", text: t("exportPending") });
            } else {
                setExportMessage({ type: "error", text: t("exportFailed") });
            }
        } catch {
            setExportMessage({ type: "error", text: t("exportFailed") });
        } finally {
            setExportLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        setDeleteLoading(true);
        setDeleteError(null);
        try {
            const res = await deleteUser();
            if (!res.ok) {
                setDeleteError(t("deleteFailed"));
                return;
            }

            if (isTauri()) {
                const { clearDesktopToken } = await import("@src/lib/desktop-auth");
                await clearDesktopToken();
            } else {
                await signOut({ redirect: false });
            }
            router.replace("/");
        } catch {
            setDeleteError(t("deleteFailed"));
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
                setMessage({ type: "success", text: t("successMessage") });
                setDirty(false);
                mutate();
            } else {
                const data = (await res.json()) as ApiResponse;
                setMessage({ type: "error", text: data.message || t("failedUpdate") });
            }
        } catch {
            setMessage({ type: "error", text: t("errorSaving") });
        } finally {
            setLoading(false);
        }
    };

    if (dangerOpen) {
        return (
            <>
                <div className={styles.exportSection}>
                    <div className={styles.exportContainer}>
                        <div className={dangerStyles.dangerItem}>
                            <div>
                                <p className={form.label}>{t("exportData")}</p>
                                <p className={dangerStyles.dangerDescription}>{t("exportDataDesc")}</p>
                            </div>
                            <button
                                className={styles.exportBtn}
                                onClick={handleRequestExport}
                                disabled={exportLoading}
                            >
                                <Download size={16} />
                                {exportLoading ? t("exportRequesting") : t("exportBtn")}
                            </button>
                        </div>
                    </div>
                    {exportMessage && (
                        <div className={`${styles.message} ${styles[exportMessage.type]}`}>
                            {exportMessage.text}
                        </div>
                    )}
                </div>

                <div className={dangerStyles.dangerContainer}>
                    <div className={dangerStyles.dangerItem}>
                        <div>
                            <p className={`${form.label} ${dangerStyles.dangerLabel}`}>{t("deleteAccount")}</p>
                            <p className={dangerStyles.dangerDescription}>{t("deleteAccountDesc")}</p>
                        </div>
                        <button className={dangerStyles.dangerBtn} onClick={() => setShowDeleteDialog(true)}>
                            {t("deleteBtn")}
                        </button>
                    </div>
                </div>

                {showDeleteDialog && (
                    <div className={dangerStyles.overlay}>
                        <div className={dangerStyles.modal}>
                            <h2 className={dangerStyles.modalTitle}>{t("deleteModalTitle")}</h2>
                            <p className={dangerStyles.modalDescription}>{t("deleteModalDesc")}</p>
                            {hasLiveSubscription && (
                                <div className={styles.subscriptionWarning}>
                                    <TriangleAlert size={16} className={styles.subscriptionWarningIcon} />
                                    <span>
                                        {isAppleSubscription
                                            ? t("deleteSubscriptionWarningApple", { date: proExpiryDate })
                                            : t("deleteSubscriptionWarning", { date: proExpiryDate })}
                                    </span>
                                </div>
                            )}
                            <label
                                htmlFor="delete-confirm"
                                className={dangerStyles.modalDescription}
                                style={{ display: "block" }}
                            >
                                {t("deleteConfirmLabel")}
                                <strong style={{ display: "block", marginTop: 6 }}>{confirmPhrase}</strong>
                            </label>
                            <input
                                id="delete-confirm"
                                type="text"
                                className={`${sharedStyles.input} ${dangerStyles.modalInput}`}
                                value={deleteConfirmInput}
                                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                                autoComplete="off"
                            />
                            {deleteError && (
                                <div className={`${styles.message} ${styles.error}`}>{deleteError}</div>
                            )}
                            <div className={dangerStyles.modalActions}>
                                <button
                                    className={`${modal.modalBtn} ${modal.modalBtnDanger}`}
                                    onClick={handleDeleteAccount}
                                    disabled={deleteLoading || deleteConfirmInput !== confirmPhrase}
                                >
                                    <Trash2 size={16} color="#ffffff" />
                                    {deleteLoading ? t("deleting") : t("deleteAccountBtn")}
                                </button>
                                <button
                                    className={`${modal.modalBtn} ${modal.modalBtnCancel}`}
                                    onClick={() => {
                                        setShowDeleteDialog(false);
                                        setDeleteConfirmInput("");
                                        setDeleteError(null);
                                    }}
                                    disabled={deleteLoading}
                                >
                                    {tCommon("cancel")}
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
                <label htmlFor="email" className={form.label}>
                    {t("email")}
                </label>
                <input
                    id="email"
                    type="email"
                    value={user?.email ?? ""}
                    disabled
                    className={sharedStyles.input}
                    autoComplete="email"
                />
            </div>

            {/* Username */}
            <div className={sharedStyles.formGroup}>
                <label htmlFor="username" className={form.label}>
                    {t("username")}
                </label>
                <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={handleUsernameChange}
                    className={sharedStyles.input}
                    placeholder={t("usernamePlaceholder")}
                    maxLength={32}
                    autoComplete="username"
                />
                <p className={sharedStyles.helpText}>{t("usernameHelp")}</p>
            </div>

            {/* Color */}
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("color")}</label>
                <div className={styles.colorSection}>
                    <div className={styles.colorPresets}>
                        {PRESET_COLORS.map((presetColor) => (
                            <button
                                key={presetColor}
                                type="button"
                                className={`${styles.colorPreset} ${color === presetColor ? styles.selected : ""}`}
                                style={{ backgroundColor: presetColor }}
                                onClick={() => handleColorChange(presetColor)}
                                aria-label={t("selectColor", { color: presetColor })}
                            />
                        ))}
                    </div>
                    <div className={styles.colorCustom}>
                        <span className={styles.colorValue}>{color.toUpperCase()}</span>
                        <label
                            htmlFor="custom-color"
                            className={`${styles.colorPreset} ${styles.customColorSwatch} ${!PRESET_COLORS.includes(color) ? styles.selected : ""}`}
                            style={{ backgroundColor: color }}
                            title={t("customColor")}
                        >
                            <input
                                id="custom-color"
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
                    <Save size={18} />
                    {loading ? t("saving") : tCommon("save")}
                </button>
                <button
                    type="button"
                    className={dangerStyles.arrowBtn}
                    onClick={onDangerToggle}
                    title={t("dangerZoneTitle")}
                >
                    <ArrowRight size={16} />
                </button>
            </div>
        </div>
    );
};

export default ProfileSettings;
