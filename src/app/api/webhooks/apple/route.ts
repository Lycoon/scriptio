import { NextRequest, NextResponse } from "next/server";
import { decodeJwt } from "jose";
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
    if (transaction.appAccountToken) {
        const user = await UserService.getUserFromId(transaction.appAccountToken);
        if (user) return { id: user.id };
    }
    // Fallback: look up via the transaction stored during initial purchase verification
    const tx = await TransactionService.findUserByTransactionId(transaction.transactionId);
    return tx ? { id: tx.userId } : null;
}

export async function POST(req: NextRequest) {
    const body = (await req.json().catch(() => ({}))) as { signedPayload?: string };
    if (!body.signedPayload) {
        return NextResponse.json({ error: "Missing signedPayload" }, { status: 400 });
    }

    const notification = decodeJwt(body.signedPayload) as unknown as AppleNotificationPayload;
    const transaction = decodeJwt(notification.data.signedTransactionInfo) as unknown as AppleTransactionInfo;
    const renewal = notification.data.signedRenewalInfo
        ? (decodeJwt(notification.data.signedRenewalInfo) as unknown as AppleRenewalInfo)
        : null;

    const user = await findUser(transaction);
    if (!user) {
        console.warn("[Apple webhook] No user found for transaction:", transaction.transactionId);
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
            await TransactionService.createTransactionIfNotExists(user.id, "APPLE", transaction.transactionId);
            break;
        }

        case "EXPIRED":
        case "REVOKE": {
            await UserService.updateUserFromId(user.id, {
                isProUntil: null,
                subscriptionProvider: null,
                isSubscriptionCancelled: false,
            });
            break;
        }

        case "DID_CHANGE_RENEWAL_STATUS": {
            const autoRenewOff = renewal?.autoRenewStatus === 0;
            await UserService.updateUserFromId(user.id, {
                isSubscriptionCancelled: autoRenewOff,
            });
            break;
        }

        case "REFUND": {
            await UserService.updateUserFromId(user.id, {
                isProUntil: null,
                subscriptionProvider: null,
                isSubscriptionCancelled: false,
            });
            break;
        }
    }

    return NextResponse.json({ received: true });
}
