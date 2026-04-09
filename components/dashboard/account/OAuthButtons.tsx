"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { signIn } from "next-auth/react";
import { isTauri } from "@tauri-apps/api/core";
import { useTranslations } from "next-intl";

import GoogleIcon from "@components/icons/GoogleIcon";
import AppleIcon from "@components/icons/AppleIcon";

import sharedStyles from "../project/ProjectSettings.module.css";
import styles from "./AuthForm.module.css";

type Provider = "google" | "apple";

type Props = {
    callbackUrl?: string;
};

const OAuthButtons = ({ callbackUrl = "/" }: Props) => {
    const { mutate } = useSWRConfig();
    const t = useTranslations("oauth");
    const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);
    const [error, setError] = useState<string | null>(null);

    const startOAuth = async (provider: Provider) => {
        setError(null);

        if (!isTauri()) {
            await signIn(provider, { callbackUrl });
            return;
        }

        setPendingProvider(provider);
        try {
            const { generateBridgeNonce, pollBridgeToken, setDesktopToken } = await import("@src/lib/desktop-auth");
            const { openUrl } = await import("@tauri-apps/plugin-opener");

            const nonce = generateBridgeNonce();
            const apiBase = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
            const bridgeUrl = `${apiBase}/desktop-auth/start?provider=${provider}&nonce=${encodeURIComponent(nonce)}`;
            await openUrl(bridgeUrl);

            const token = await pollBridgeToken(nonce);
            if (!token) {
                setError(t("timeout"));
                return;
            }

            await setDesktopToken(token);
            await mutate("/api/users/cookie");
            await mutate("/api/users");
        } catch (err) {
            console.error("[OAuthButtons] Desktop OAuth failed:", err);
            setError(t("error"));
        } finally {
            setPendingProvider(null);
        }
    };

    return (
        <>
            <div className={styles.divider}>{t("orContinueWith")}</div>
            <div className={styles.oauthGroup}>
                <button
                    type="button"
                    className={`${sharedStyles.formBtn} ${styles.oauthBtn}`}
                    onClick={() => startOAuth("google")}
                    disabled={pendingProvider !== null}
                >
                    <GoogleIcon size={18} />
                    {pendingProvider === "google" ? t("waiting") : t("continueWithGoogle")}
                </button>
                <button
                    type="button"
                    className={`${sharedStyles.formBtn} ${styles.oauthBtn}`}
                    onClick={() => startOAuth("apple")}
                    disabled={pendingProvider !== null}
                >
                    <AppleIcon size={18} />
                    {pendingProvider === "apple" ? t("waiting") : t("continueWithApple")}
                </button>
            </div>
            {error && <div className={`${styles.message} ${styles.error}`}>{error}</div>}
        </>
    );
};

export default OAuthButtons;
