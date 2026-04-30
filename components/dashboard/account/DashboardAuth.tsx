"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { isTauri } from "@tauri-apps/api/core";

import { requestMagicLink } from "@src/lib/utils/requests";
import { ApiResponse } from "@src/lib/utils/api-utils";
import { RequestMagicLinkBody } from "@src/lib/utils/api-bodies";
import { useDesktopBridgeAuth } from "@src/lib/utils/hooks";

import OAuthButtons from "./OAuthButtons";

import form from "./../../utils/Form.module.css";
import sharedStyles from "../project/ProjectSettings.module.css";
import styles from "./AuthForm.module.css";

type MessageType = "success" | "error" | "info";

const DashboardAuth = () => {
    const tAuth = useTranslations("auth");
    const { completeBridgeAuth } = useDesktopBridgeAuth();

    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [message, setMessage] = useState<{ type: MessageType; text: string } | null>(null);
    const [pollingDesktop, setPollingDesktop] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;

        setLoading(true);
        setMessage(null);

        try {
            const body: RequestMagicLinkBody = { email };

            if (isTauri()) {
                const { generateBridgeNonce } = await import("@src/lib/desktop-auth");
                const nonce = generateBridgeNonce();
                body.desktopNonce = nonce;

                const res = await requestMagicLink(body);
                if (!res.ok) {
                    const json = (await res.json()) as ApiResponse;
                    setMessage({ type: "error", text: json.message || tAuth("requestFailed") });
                    return;
                }

                setSubmitted(true);
                setPollingDesktop(true);

                const result = await completeBridgeAuth(nonce);
                if (result === "timeout") {
                    setMessage({ type: "error", text: tAuth("desktopTimeout") });
                    setPollingDesktop(false);
                    setSubmitted(false);
                }
                return;
            }

            const res = await requestMagicLink(body);
            const json = (await res.json()) as ApiResponse;
            if (!res.ok) {
                setMessage({ type: "error", text: json.message || tAuth("requestFailed") });
                return;
            }
            setSubmitted(true);
        } catch (err) {
            console.error("[DashboardAuth] Magic link request failed:", err);
            setMessage({ type: "error", text: tAuth("requestFailed") });
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <div className={`${sharedStyles.settingsForm} ${styles.authForm}`}>
                <div className={`${styles.message} ${styles.info}`}>
                    {tAuth("checkInbox", { email })}
                </div>
                <button
                    type="button"
                    className={styles.authSwitchLink}
                    style={{ alignSelf: "flex-end" }}
                    onClick={() => {
                        setSubmitted(false);
                        setPollingDesktop(false);
                        setMessage(null);
                    }}
                >
                    {tAuth("useDifferentEmail")}
                </button>
                {pollingDesktop && (
                    <p className={styles.authInfoText}>{tAuth("waitingForClick")}</p>
                )}
            </div>
        );
    }

    return (
        <form className={`${sharedStyles.settingsForm} ${styles.authForm}`} onSubmit={handleSubmit}>
            <div className={sharedStyles.formGroup}>
                <label htmlFor="auth-email" className={form.label}>
                    {tAuth("emailLabel")}
                </label>
                <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                        setEmail(e.target.value);
                        setMessage(null);
                    }}
                    className={sharedStyles.input}
                    required
                />
            </div>

            {message && <div className={`${styles.message} ${styles[message.type]}`}>{message.text}</div>}

            <div className={styles.authActions}>
                <button
                    type="submit"
                    className={`${sharedStyles.formBtn} ${styles.authSubmitBtn}`}
                    disabled={loading}
                >
                    {loading ? tAuth("sending") : tAuth("sendLink")}
                </button>
            </div>

            <OAuthButtons />
        </form>
    );
};

export default DashboardAuth;
