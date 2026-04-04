"use client";

import { useContext, useState } from "react";
import { signup } from "@src/lib/utils/requests";
import { ApiResponse } from "@src/lib/utils/api-utils";
import { SignupBody } from "@src/lib/utils/api-bodies";
import { useRouter } from "next/navigation";
import { DashboardContext } from "@src/context/DashboardContext";
import { useTranslations } from "next-intl";

import form from "./../../utils/Form.module.css";
import sharedStyles from "../project/ProjectSettings.module.css";
import styles from "./SecuritySettings.module.css";

type MessageType = "success" | "error" | "info";

const DashboardSignup = () => {
    const router = useRouter();
    const { setActiveTab } = useContext(DashboardContext);
    const t = useTranslations("signup");

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: MessageType; text: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            setMessage({ type: "error", text: t("passwordsDoNotMatch") });
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            const body: SignupBody = { email, password };
            const res = await signup(body);
            const json = (await res.json()) as ApiResponse;

            if (res.ok) {
                if (json.data?.redirectUrl) {
                    router.push(json.data.redirectUrl);
                    return;
                }
                setMessage({
                    type: "info",
                    text: json.message || t("verificationEmail"),
                });
            } else {
                setMessage({ type: "error", text: json.message || t("signUpFailed") });
            }
        } catch {
            setMessage({ type: "error", text: t("unexpectedError") });
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className={`${sharedStyles.settingsForm} ${styles.authForm}`} onSubmit={handleSubmit}>
            <div className={sharedStyles.formGroup}>
                <label htmlFor="signup-email" className={form.label}>
                    {t("emailLabel")}
                </label>
                <input
                    id="signup-email"
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
                <label htmlFor="signup-password" className={form.label}>
                    {t("passwordLabel")}
                </label>
                <input
                    id="signup-password"
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

            <div className={sharedStyles.formGroup}>
                <label htmlFor="signup-confirm-password" className={form.label}>
                    {t("confirmPasswordLabel")}
                </label>
                <input
                    id="signup-confirm-password"
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

            {message && <div className={`${styles.message} ${styles[message.type]}`}>{message.text}</div>}

            <div className={`${sharedStyles.formActions} ${styles.authFormActions}`}>
                <button type="button" className={styles.switchModeBtn} onClick={() => setActiveTab("Login")}>
                    {t("alreadyHaveAccount")}
                </button>
                <button type="submit" className={sharedStyles.formBtn} disabled={loading}>
                    {loading ? t("signingUp") : t("signUp")}
                </button>
            </div>
        </form>
    );
};

export default DashboardSignup;
