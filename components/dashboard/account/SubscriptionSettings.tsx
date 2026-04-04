"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, Lock } from "lucide-react";
import { cancelStripeSubscription, createStripeCheckout } from "@src/lib/utils/requests";
import { useUser } from "@src/lib/utils/hooks";

import styles from "./SubscriptionSettings.module.css";

const PERKS = ["perkProjects", "perkSaves", "perkCollaborators", "perkAutoSave"] as const;

const SubscriptionSettings = () => {
    const { user, mutate } = useUser();
    const t = useTranslations("profile");

    const [upgradeLoading, setUpgradeLoading] = useState(false);
    const [cancelConfirm, setCancelConfirm] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    const isPro = !!user?.isProUntil && new Date(user.isProUntil) > new Date();
    const isCancelled = !!user?.isSubscriptionCancelled;
    const expiryDate = user?.isProUntil ? new Date(user.isProUntil).toLocaleDateString() : "";

    const handleUpgrade = async () => {
        setUpgradeLoading(true);
        const result = await createStripeCheckout();
        if (result?.url) {
            window.location.href = result.url;
        } else {
            setUpgradeLoading(false);
        }
    };

    const handleCancel = async () => {
        setCancelling(true);
        const ok = await cancelStripeSubscription();
        if (ok) await mutate();
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
                            {t("subscription.cancelConfirm", { date: expiryDate })}
                        </p>
                        <div className={styles.confirmBtns}>
                            <button className={styles.confirmYes} onClick={handleCancel} disabled={cancelling}>
                                {cancelling ? t("subscription.cancelling") : t("subscription.cancelYes")}
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
                    {upgradeLoading ? t("subscription.redirecting") : t("subscription.upgradeBtn")}
                    {!upgradeLoading && <ArrowRight size={16} />}
                </button>
            )}
        </div>
    );
};

export default SubscriptionSettings;
