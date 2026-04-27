"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, Lock } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { cancelStripeSubscription, createStripeCheckout, submitApplePurchase } from "@src/lib/utils/requests";
import { useUser } from "@src/lib/utils/hooks";

import styles from "./SubscriptionSettings.module.css";

const APPLE_PRODUCT_ID = "app.scriptio.pro.monthly";
const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";
const PERKS = ["perkProjects", "perkSaves", "perkCollaborators", "perkAutoSave"] as const;

const SubscriptionSettings = () => {
    const { user, mutate } = useUser();
    const t = useTranslations("profile");

    const [upgradeLoading, setUpgradeLoading] = useState(false);
    const [cancelConfirm, setCancelConfirm] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isPro = !!user?.isProUntil && new Date(user.isProUntil) > new Date();
    const isCancelled = !!user?.isSubscriptionCancelled;
    const isApple = user?.subscriptionProvider === "APPLE";
    const expiryDate = user?.isProUntil ? new Date(user.isProUntil).toLocaleDateString() : "";

    // Restore Apple purchases on mount to sync subscription state with the server.
    useEffect(() => {
        if (!isTauri() || !user?.id) return;

        let cancelled = false;

        async function syncAppleSubscription() {
            try {
                const { restorePurchases, PurchaseState } = await import("@choochmeque/tauri-plugin-iap-api");
                const { purchases } = await restorePurchases("subs");
                const active = purchases.find(
                    (p) => p.productId === APPLE_PRODUCT_ID
                        && p.purchaseState === PurchaseState.PURCHASED
                        && p.jwsRepresentation,
                );
                if (cancelled) return;
                if (active?.jwsRepresentation) {
                    await submitApplePurchase(active.jwsRepresentation);
                    await mutate();
                }
            } catch {
                // Restore can fail if the user is not signed into the App Store — silently ignore.
            }
        }

        syncAppleSubscription();
        return () => { cancelled = true; };
    }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleUpgrade = async () => {
        setError(null);
        setUpgradeLoading(true);

        if (isTauri()) {
            try {
                const { purchase, PurchaseState } = await import("@choochmeque/tauri-plugin-iap-api");
                const result = await purchase(APPLE_PRODUCT_ID, "subs", {
                    appAccountToken: user?.id,
                });

                if (result.purchaseState !== PurchaseState.PURCHASED || !result.jwsRepresentation) {
                    setError(t("subscription.purchaseError"));
                    return;
                }

                const ok = await submitApplePurchase(result.jwsRepresentation);
                if (ok) {
                    await mutate();
                } else {
                    setError(t("subscription.purchaseError"));
                }
            } catch (err) {
                console.error("[SubscriptionSettings] Apple IAP failed:", err);
                setError(t("subscription.purchaseError"));
            } finally {
                setUpgradeLoading(false);
            }
        } else {
            const result = await createStripeCheckout();
            if (result?.url) {
                window.location.href = result.url;
            } else {
                setUpgradeLoading(false);
            }
        }
    };

    const handleCancel = async () => {
        setCancelling(true);

        if (isApple) {
            // Apple subscriptions are managed through the App Store.
            // This works on any platform: macOS opens App Store, Windows/web opens in browser.
            if (isTauri()) {
                const { openUrl } = await import("@tauri-apps/plugin-opener");
                await openUrl(APPLE_SUBSCRIPTIONS_URL);
            } else {
                window.open(APPLE_SUBSCRIPTIONS_URL, "_blank");
            }
        } else {
            const ok = await cancelStripeSubscription();
            if (ok) await mutate();
        }

        setCancelling(false);
        setCancelConfirm(false);
    };

    return (
        <div className={styles.card} data-pro={String(isPro)}>
            {/* Header */}
            <div className={styles.header}>
                <span className={styles.planName}>
                    {isPro ? t("subscription.proTitle") : t("subscription.freeTitle")}
                </span>
                {isPro && <span className={styles.proBadge}>{t("subscription.proBadge")}</span>}
            </div>

            {/* Renewal / end date */}
            {isPro && (
                <p className={styles.renewDate}>
                    {isCancelled
                        ? t("subscription.endsOn", { date: expiryDate })
                        : t("subscription.renewsOn", { date: expiryDate })
                    }
                </p>
            )}

            {/* Perks list */}
            <div className={styles.perksSection}>
                <p className={styles.perksTitle}>
                    {isPro ? t("subscription.perksTitle") : t("subscription.upgradeTitle")}
                </p>
                {PERKS.map((perk) => (
                    <div key={perk} className={styles.perkItem}>
                        {isPro
                            ? <Check size={14} className={styles.perkIconPro} />
                            : <Lock size={14} className={styles.perkIconFree} />
                        }
                        {t(`subscription.${perk}` as Parameters<typeof t>[0])}
                    </div>
                ))}
            </div>

            {/* Actions */}
            {isPro ? (
                isCancelled ? (
                    <p className={styles.cancelSuccess}>
                        {t("subscription.cancelSuccess", { date: expiryDate })}
                    </p>
                ) : cancelConfirm ? (
                    <div className={styles.confirmBox}>
                        <p className={styles.confirmText}>
                            {isApple
                                ? t("subscription.cancelApple")
                                : t("subscription.cancelConfirm", { date: expiryDate })
                            }
                        </p>
                        <div className={styles.confirmBtns}>
                            <button className={styles.confirmYes} onClick={handleCancel} disabled={cancelling}>
                                {cancelling
                                    ? t("subscription.cancelling")
                                    : isApple
                                        ? t("subscription.manageApple")
                                        : t("subscription.cancelYes")
                                }
                            </button>
                            <button className={styles.confirmNo} onClick={() => setCancelConfirm(false)} disabled={cancelling}>
                                {t("subscription.cancelNo")}
                            </button>
                        </div>
                    </div>
                ) : (
                    <button className={styles.cancelBtn} onClick={() => setCancelConfirm(true)}>
                        {t("subscription.cancel")}
                    </button>
                )
            ) : (
                <button className={styles.upgradeBtn} onClick={handleUpgrade} disabled={upgradeLoading}>
                    {upgradeLoading
                        ? isTauri() ? t("subscription.purchasing") : t("subscription.redirecting")
                        : t("subscription.upgradeBtn")
                    }
                    {!upgradeLoading && <ArrowRight size={16} />}
                </button>
            )}

            {error && <p className={styles.cancelSuccess} style={{ color: "var(--error)" }}>{error}</p>}
        </div>
    );
};

export default SubscriptionSettings;
