import { NextRequest, NextResponse } from "next/server";
import { verifyAppleJws } from "@src/lib/apple-jws";
import { logger } from "@src/lib/utils/logger";
import * as UserService from "@src/server/service/user-service";
import * as TransactionService from "@src/server/service/transaction-service";

interface AppleNotificationPayload {
    notificationType: string;
    subtype?: string;
    data: {
        signedTransactionInfo: string;
        signedRenewalInfo?: string;
    };
}

interface AppleTransactionInfo {
    transactionId: string;
    originalTransactionId: string;
    bundleId: string;
    productId: string;
    purchaseDate: number;
    expiresDate: number;
    type: string;
    appAccountToken?: string;
}

interface AppleRenewalInfo {
    autoRenewStatus: number; // 1 = on, 0 = off
}

async function findUser(transaction: AppleTransactionInfo): Promise<{ id: string } | null> {
    // appAccountToken is the user ID set at purchase time via StoreKit's appAccountToken option.
    if (transaction.appAccountToken) {
        const user = await UserService.getUserFromId(transaction.appAccountToken);
        if (user) {
            logger.debug("[Apple webhook] Resolved user via appAccountToken", { userId: user.id });
            return { id: user.id };
        }
    }
    // Fallback: look up via originalTransactionId, which is the stable anchor stored
    // in the Transaction table during the initial /api/apple/purchase call.
    const tx = await TransactionService.findUserByTransactionId(transaction.originalTransactionId);
    if (tx) {
        logger.debug("[Apple webhook] Resolved user via originalTransactionId", {
            userId: tx.userId,
            originalTransactionId: transaction.originalTransactionId,
        });
    }
    return tx ? { id: tx.userId } : null;
}

export async function POST(req: NextRequest) {
    const body = (await req.json().catch(() => ({}))) as { signedPayload?: string };
    if (!body.signedPayload) {
        return NextResponse.json({ error: "Missing signedPayload" }, { status: 400 });
    }

    let notification: AppleNotificationPayload;
    let transaction: AppleTransactionInfo;
    let renewal: AppleRenewalInfo | null = null;

    try {
        notification = await verifyAppleJws<AppleNotificationPayload>(body.signedPayload);
        transaction = await verifyAppleJws<AppleTransactionInfo>(notification.data.signedTransactionInfo);
        if (notification.data.signedRenewalInfo) {
            renewal = await verifyAppleJws<AppleRenewalInfo>(notification.data.signedRenewalInfo);
        }
    } catch (err) {
        logger.error("[Apple webhook] JWS verification failed", err);
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    logger.debug("[Apple webhook] Received notification", {
        type: notification.notificationType,
        subtype: notification.subtype,
        originalTransactionId: transaction.originalTransactionId,
    });

    const user = await findUser(transaction);
    if (!user) {
        logger.warn("[Apple webhook] No user found for transaction", {
            originalTransactionId: transaction.originalTransactionId,
        });
        return NextResponse.json({ received: true });
    }

    switch (notification.notificationType) {
        case "SUBSCRIBED":
        case "DID_RENEW": {
            const expiresDate = new Date(transaction.expiresDate);
            await UserService.updateUserFromId(user.id, {
                isProUntil: expiresDate,
                subscriptionProvider: "APPLE",
                isSubscriptionCancelled: false,
            });
            await TransactionService.createTransactionIfNotExists(user.id, "APPLE", transaction.originalTransactionId);
            logger.debug("[Apple webhook] Pro granted", { userId: user.id, expiresDate });
            break;
        }

        case "EXPIRED":
        case "REVOKE": {
            await UserService.updateUserFromId(user.id, {
                isProUntil: null,
                subscriptionProvider: null,
                isSubscriptionCancelled: false,
            });
            logger.debug("[Apple webhook] Pro revoked", { userId: user.id, reason: notification.notificationType });
            break;
        }

        case "DID_CHANGE_RENEWAL_STATUS": {
            const autoRenewOff = renewal?.autoRenewStatus === 0;
            await UserService.updateUserFromId(user.id, { isSubscriptionCancelled: autoRenewOff });
            logger.debug("[Apple webhook] Renewal status changed", { userId: user.id, autoRenewOff });
            break;
        }

        case "REFUND": {
            await UserService.updateUserFromId(user.id, {
                isProUntil: null,
                subscriptionProvider: null,
                isSubscriptionCancelled: false,
            });
            logger.debug("[Apple webhook] Pro refunded", { userId: user.id });
            break;
        }
    }

    return NextResponse.json({ received: true });
}
