"use client";

import { useContext, useState } from "react";
import { useSWRConfig } from "swr";
import { login, requestRecovery, recoverPassword } from "@src/lib/utils/requests";
import { ApiResponse } from "@src/lib/utils/api-utils";
import { LoginBody, RequestRecoveryBody, RecoverPasswordBody } from "@src/lib/utils/api-bodies";
import { isTauri } from "@tauri-apps/api/core";
import { useSearchParams } from "next/navigation";
import { DashboardContext } from "@src/context/DashboardContext";
import { useTranslations } from "next-intl";

import form from "./../../utils/Form.module.css";
import sharedStyles from "../project/ProjectSettings.module.css";
import styles from "./SecuritySettings.module.css";

type Mode = "login" | "recovery" | "passwordChange";
type MessageType = "success" | "error" | "info";

const DashboardLogin = () => {
    const { mutate } = useSWRConfig();
    const { setActiveTab } = useContext(DashboardContext);
    const searchParams = useSearchParams();
    const t = useTranslations("login");

    const recoveryId = searchParams.get("id");
    const recoveryCode = searchParams.get("code");

    const [mode, setMode] = useState<Mode>(recoveryId && recoveryCode ? "passwordChange" : "login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: MessageType; text: string } | null>(null);
    const [recoverySent, setRecoverySent] = useState(false);

    const switchMode = (newMode: Mode) => {
        setMode(newMode);
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setMessage(null);
        setRecoverySent(false);
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            const body: LoginBody = { email, password };
            const res = await login(body);

            if (res.ok) {
                const json = (await res.json()) as ApiResponse;

                if (isTauri() && json.data?.token) {
                    const { setDesktopToken } = await import("@src/lib/desktop-auth");
                    await setDesktopToken(json.data.token);
                }

                await mutate("/api/users/cookie");
                await mutate("/api/users");
                setMessage({ type: "success", text: t("loggedIn") });
            } else {
                const json = (await res.json()) as ApiResponse;
                setMessage({ type: "error", text: json.message || t("loginFailed") });
            }
        } catch (err) {
            console.error("[DashboardLogin] Login failed:", err);
            setMessage({ type: "error", text: t("unexpectedError") });
        } finally {
            setLoading(false);
        }
    };

    const handleRequestRecovery = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            const body: RequestRecoveryBody = { email };
            const res = await requestRecovery(body);
            const json = (await res.json()) as ApiResponse;

            if (res.ok) {
                setMessage({ type: "info", text: json.message || t("recoverySent") });
                setRecoverySent(true);
            } else {
                setMessage({ type: "error", text: json.message || t("recoveryError") });
            }
        } catch {
            setMessage({ type: "error", text: t("unexpectedError") });
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            setMessage({ type: "error", text: t("passwordsDoNotMatch") });
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            const body: RecoverPasswordBody = {
                userId: recoveryId!,
                recoverHash: recoveryCode!,
                password,
            };
            const res = await recoverPassword(body);
            const json = (await res.json()) as ApiResponse;

            if (res.ok) {
                setMessage({ type: "success", text: t("passwordChanged") });
                setTimeout(() => switchMode("login"), 3000);
            } else {
                setMessage({ type: "error", text: json.message || t("failedToChange") });
            }
        } catch {
            setMessage({ type: "error", text: t("unexpectedError") });
        } finally {
            setLoading(false);
        }
    };

    const submitHandlers: Record<Mode, (e: React.FormEvent) => void> = {
        login: handleLogin,
        recovery: handleRequestRecovery,
        passwordChange: handlePasswordChange,
    };

    const showEmail = mode === "login" || (mode === "recovery" && !recoverySent);
    const showPassword = mode === "login" || mode === "passwordChange";
    const showConfirm = mode === "passwordChange";
    const showSubmit = !(mode === "recovery" && recoverySent);

    return (
        <form className={`${sharedStyles.settingsForm} ${styles.authForm}`} onSubmit={submitHandlers[mode]}>
            {showEmail && (
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
            )}

            {showPassword && (
                <div className={sharedStyles.formGroup}>
                    <div className={styles.fieldHeader}>
                        <label htmlFor="auth-password" className={form.label}>
                            {mode === "passwordChange" ? t("newPasswordLabel") : t("passwordLabel")}
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
            )}

            {showConfirm && (
                <div className={sharedStyles.formGroup}>
                    <label htmlFor="auth-confirm-password" className={form.label}>
                        {t("confirmPasswordLabel")}
                    </label>
                    <input
                        id="auth-confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            setMessage(null);
                        }}
                        className={sharedStyles.input}

                        required
                    />
                </div>
            )}

            {message && <div className={`${styles.message} ${styles[message.type]}`}>{message.text}</div>}

            <div className={`${sharedStyles.formActions} ${styles.authFormActions}`}>
                {mode === "login" && (
                    <button type="button" className={styles.forgotPasswordBtn} onClick={() => switchMode("recovery")}>
                        {t("forgotPassword")}
                    </button>
                )}
                {mode === "recovery" && (
                    <button type="button" className={styles.switchModeBtn} onClick={() => switchMode("login")}>
                        {t("backToLogin")}
                    </button>
                )}

                {showSubmit && (
                    <button type="submit" className={sharedStyles.formBtn} disabled={loading}>
                        {loading
                            ? mode === "login"
                                ? t("loggingIn")
                                : mode === "recovery"
                                  ? t("sending")
                                  : t("saving")
                            : mode === "login"
                              ? t("logIn")
                              : mode === "recovery"
                                ? t("sendRecoveryEmail")
                                : t("changePassword")}
                    </button>
                )}
            </div>
        </form>
    );
};

export default DashboardLogin;
