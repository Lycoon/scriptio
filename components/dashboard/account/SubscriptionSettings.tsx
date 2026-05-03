"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, Lock, Sparkles } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { cancelStripeSubscription, createStripeCheckout, getAppleSubscriptionOwner, submitApplePurchase, transferAppleSubscription } from "@src/lib/utils/requests";
import { useUser } from "@src/lib/utils/hooks";
import { useLocale } from "@src/context/LocaleContext";

import styles from "./SubscriptionSettings.module.css";

const APPLE_PRODUCT_ID = "app.scriptio.pro.monthly";
const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";
const PERKS = ["perkProjects", "perkSaves", "perkCollaborators", "perkAutoSave"] as const;

// Apple IAP is disabled at launch — Pro is sold exclusively via the website.
// All IAP code paths (mount sync, purchase, restore/transfer) are kept but
// gated by this flag so re-enabling later is a one-line change.
const APPLE_IAP_ENABLED = false;

// Apple IAP is only available on the macOS Tauri build. The Windows Tauri
// build is distributed via the Microsoft Store but uses Stripe for billing.
const isMacosTauri = () =>
    isTauri() && typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);

const SubscriptionSettings = () => {
    const { user, mutate } = useUser();
    const t = useTranslations("profile");
    const { locale } = useLocale();

    const [upgradeLoading, setUpgradeLoading] = useState(false);
    const [cancelConfirm, setCancelConfirm] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showWelcome, setShowWelcome] = useState(
        () => typeof window !== "undefined" && sessionStorage.getItem("proWelcome") === "1"
    );
    const [welcomeLeaving, setWelcomeLeaving] = useState(false);
    // When the App Store account has an active subscription bound to a
    // different Scriptio account, we capture the JWS + masked owner email so
    // we can offer a "Restore Purchases" flow that transfers it.
    const [transferableJws, setTransferableJws] = useState<string | null>(null);
    const [transferableEmail, setTransferableEmail] = useState<string | null>(null);
    const [transferConfirm, setTransferConfirm] = useState(false);
    const [transferring, setTransferring] = useState(false);
    // Detect macOS Tauri after mount so SSR renders the same tree the client
    // initially does, avoiding hydration mismatches.
    const [isAppleStoreBuild, setIsAppleStoreBuild] = useState(false);
    useEffect(() => { setIsAppleStoreBuild(isMacosTauri()); }, []);
    const showAppleStoreNotice = isAppleStoreBuild && !APPLE_IAP_ENABLED;

    const isPro = !!user?.isProUntil && new Date(user.isProUntil) > new Date();
    const isCancelled = !!user?.isSubscriptionCancelled;
    const isApple = user?.subscriptionProvider === "APPLE";
    const expiryDate = user?.isProUntil
        ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(new Date(user.isProUntil))
        : "";

    // Restore Apple purchases on mount to sync subscription state with the server.
    useEffect(() => {
        if (!APPLE_IAP_ENABLED || !isMacosTauri() || !user?.id) return;

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
                if (cancelled || !active?.jwsRepresentation) return;

                const ok = await submitApplePurchase(active.jwsRepresentation);
                if (cancelled) return;
                if (ok) {
                    await mutate();
                } else {
                    // The App Store has an active sub but it's bound to a
                    // different Scriptio account — surface a Restore Purchases
                    // flow rather than the regular Upgrade button.
                    const ownerEmail = await getAppleSubscriptionOwner(active.jwsRepresentation);
                    if (cancelled) return;
                    setTransferableJws(active.jwsRepresentation);
                    setTransferableEmail(ownerEmail);
                }
            } catch {
                // Restore can fail if the user is not signed into the App Store — silently ignore.
            }
        }

        syncAppleSubscription();
        return () => { cancelled = true; };
    }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!showWelcome) return;
        sessionStorage.removeItem("proWelcome");
        const fadeTimer = setTimeout(() => setWelcomeLeaving(true), 4000);
        const hideTimer = setTimeout(() => setShowWelcome(false), 4600);
        return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const showOwnerError = async (jwsRepresentation: string) => {
        const ownerEmail = await getAppleSubscriptionOwner(jwsRepresentation);
        if (ownerEmail) {
            setError(t("subscription.alreadyBoundTo", { email: ownerEmail }));
        } else {
            setError(t("subscription.alreadyBoundUnknown"));
        }
    };

    const handleUpgrade = async () => {
        setError(null);
        setUpgradeLoading(true);

        if (isMacosTauri()) {
            try {
                const { purchase, restorePurchases, PurchaseState } = await import("@choochmeque/tauri-plugin-iap-api");
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
                    await showOwnerError(result.jwsRepresentation);
                }
            } catch (err) {
                // StoreKit may throw when the Apple ID already has an active subscription.
                // Restore purchases to find the existing JWS and identify the linked account.
                try {
                    const { restorePurchases, PurchaseState } = await import("@choochmeque/tauri-plugin-iap-api");
                    const { purchases } = await restorePurchases("subs");
                    const existing = purchases.find(
                        (p) => p.productId === APPLE_PRODUCT_ID
                            && p.purchaseState === PurchaseState.PURCHASED
                            && p.jwsRepresentation,
                    );
                    if (existing?.jwsRepresentation) {
                        await showOwnerError(existing.jwsRepresentation);
                        return;
                    }
                } catch { /* ignore */ }

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
                setError(t("subscription.purchaseError"));
                setUpgradeLoading(false);
            }
        }
    };

    const handleTransfer = async () => {
        if (!transferableJws) return;
        setError(null);
        setTransferring(true);
        try {
            const ok = await transferAppleSubscription(transferableJws);
            if (ok) {
                setTransferableJws(null);
                setTransferableEmail(null);
                setTransferConfirm(false);
                await mutate();
            } else {
                setError(t("subscription.purchaseError"));
            }
        } finally {
            setTransferring(false);
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
            {showAppleStoreNotice ? (
                <p className={styles.infoText}>
                    {isPro
                        ? t("subscription.appleStoreProInfo")
                        : t("subscription.appleStoreFreeInfo")
                    }
                </p>
            ) : isPro ? (
                cancelConfirm ? (
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
                ) : isCancelled ? (
                    <button className={styles.upgradeBtn} onClick={handleUpgrade} disabled={upgradeLoading}>
                        {upgradeLoading
                            ? isMacosTauri() ? t("subscription.purchasing") : t("subscription.redirecting")
                            : t("subscription.resubscribe")
                        }
                        {!upgradeLoading && <ArrowRight size={16} />}
                    </button>
                ) : (
                    <button className={styles.cancelBtn} onClick={() => setCancelConfirm(true)}>
                        {t("subscription.cancel")}
                    </button>
                )
            ) : transferableJws ? (
                transferConfirm ? (
                    <div className={styles.confirmBox}>
                        <p className={styles.confirmText}>
                            {transferableEmail
                                ? t("subscription.transferConfirm", { email: transferableEmail })
                                : t("subscription.transferConfirmUnknown")
                            }
                        </p>
                        <div className={styles.confirmBtns}>
                            <button className={styles.confirmYes} onClick={handleTransfer} disabled={transferring}>
                                {transferring ? t("subscription.transferring") : t("subscription.transferYes")}
                            </button>
                            <button className={styles.confirmNo} onClick={() => setTransferConfirm(false)} disabled={transferring}>
                                {t("subscription.cancelNo")}
                            </button>
                        </div>
                    </div>
                ) : (
                    <button className={styles.upgradeBtn} onClick={() => setTransferConfirm(true)}>
                        {t("subscription.restorePurchases")}
                        <ArrowRight size={16} />
                    </button>
                )
            ) : (
                <button className={styles.upgradeBtn} onClick={handleUpgrade} disabled={upgradeLoading}>
                    {upgradeLoading
                        ? isMacosTauri() ? t("subscription.purchasing") : t("subscription.redirecting")
                        : t("subscription.upgradeBtn")
                    }
                    {!upgradeLoading && <ArrowRight size={16} />}
                </button>
            )}

            {showWelcome && (
                <div className={`${styles.welcomeBox} ${welcomeLeaving ? styles.welcomeBoxLeaving : ""}`}>
                    <Sparkles size={15} className={styles.welcomeIcon} />
                    <span>{t("subscription.welcomePro")}</span>
                </div>
            )}
            {error && <p className={styles.errorMessage}>{error}</p>}
        </div>
    );
};

export default SubscriptionSettings;
