"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { signIn } from "next-auth/react";
import { isTauri } from "@tauri-apps/api/core";
import { useTranslations } from "next-intl";

import OAuthButtons from "./OAuthButtons";

import form from "./../../utils/Form.module.css";
import sharedStyles from "../project/ProjectSettings.module.css";
import styles from "./SecuritySettings.module.css";

type MessageType = "success" | "error" | "info";

const DashboardLogin = () => {
    const { mutate } = useSWRConfig();
    const t = useTranslations("login");

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: MessageType; text: string } | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            const res = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (res?.error) {
                if (res.error === "EmailNotVerified" || res.code === "EmailNotVerified") {
                    setMessage({ type: "error", text: t("emailNotVerified") });
                } else {
                    setMessage({ type: "error", text: t("loginFailed") });
                }
                return;
            }

            await mutate("/api/users/cookie");
            await mutate("/api/users");
            setMessage({ type: "success", text: t("loggedIn") });
        } catch (err) {
            console.error("[DashboardLogin] Login failed:", err);
            setMessage({ type: "error", text: t("unexpectedError") });
        } finally {
            setLoading(false);
        }
    };

    const openRecovery = () => {
        const url = `${window.location.origin}/recovery`;
        if (isTauri()) {
            import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(url));
        } else {
            window.location.href = url;
        }
    };

    return (
        <form className={`${sharedStyles.settingsForm} ${styles.authForm}`} onSubmit={handleLogin}>
            <div className={sharedStyles.formGroup}>
                <label htmlFor="auth-email" className={form.label}>
                    {t("emailLabel")}
                </label>
                <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                        setEmail(e.target.value);
                        setMessage(null);
                    }}
                    className={sharedStyles.input}
                    required
                />
            </div>

            <div className={sharedStyles.formGroup}>
                <div className={styles.fieldHeader}>
                    <label htmlFor="auth-password" className={form.label}>
                        {t("passwordLabel")}
                    </label>
                </div>
                <input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => {
                        setPassword(e.target.value);
                        setMessage(null);
                    }}
                    className={sharedStyles.input}
                    required
                />
            </div>

            {message && <div className={`${styles.message} ${styles[message.type]}`}>{message.text}</div>}

            <div className={`${sharedStyles.formActions} ${styles.authFormActions}`}>
                <button type="button" className={styles.forgotPasswordBtn} onClick={openRecovery}>
                    {t("forgotPassword")}
                </button>
                <button type="submit" className={sharedStyles.formBtn} disabled={loading}>
                    {loading ? t("loggingIn") : t("logIn")}
                </button>
            </div>

            <OAuthButtons />
        </form>
    );
};

export default DashboardLogin;
