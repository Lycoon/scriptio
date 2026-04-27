import { NextRequest } from "next/server";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { BodyFieldError, ForbiddenError, Success } from "@src/lib/utils/api-utils";
import { verifyAppleJws, APPLE_BUNDLE_IDS, APPLE_PRODUCT_ID } from "@src/lib/apple-jws";
import { logger } from "@src/lib/utils/logger";
import * as UserService from "@src/server/service/user-service";
import * as TransactionService from "@src/server/service/transaction-service";

interface AppleTransactionPayload {
    transactionId: string;
    originalTransactionId: string;
    bundleId: string;
    productId: string;
    purchaseDate: number;
    expiresDate: number;
    type: string;
    appAccountToken?: string;
}

async function handleApplePurchase(req: NextRequest, { user }: AuthApiContext) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const jwsTransaction = body.jwsTransaction;
    if (typeof jwsTransaction !== "string") {
        throw new BodyFieldError("Missing jwsTransaction");
    }

    logger.debug("[Apple purchase] Verifying JWS", { userId: user.id });

    const payload = await verifyAppleJws<AppleTransactionPayload>(jwsTransaction);

    logger.debug("[Apple purchase] JWS verified", {
        userId: user.id,
        originalTransactionId: payload.originalTransactionId,
        bundleId: payload.bundleId,
        productId: payload.productId,
    });

    if (!APPLE_BUNDLE_IDS.includes(payload.bundleId)) {
        logger.warn("[Apple purchase] Invalid bundle ID", { bundleId: payload.bundleId, userId: user.id });
        throw new ForbiddenError("Invalid bundle ID");
    }
    if (payload.productId !== APPLE_PRODUCT_ID) {
        logger.warn("[Apple purchase] Invalid product ID", { productId: payload.productId, userId: user.id });
        throw new ForbiddenError("Invalid product ID");
    }

    // appAccountToken is the UUID embedded at purchase time (StoreKit's
    // Product.purchase(options: .init(appAccountToken:))). If present it must
    // match the caller so a receipt from one account can't be redeemed on another.
    if (payload.appAccountToken && payload.appAccountToken !== user.id) {
        logger.warn("[Apple purchase] appAccountToken mismatch", {
            appAccountToken: payload.appAccountToken,
            userId: user.id,
        });
        throw new ForbiddenError("Transaction does not belong to this account");
    }

    const expiresDate = new Date(payload.expiresDate);
    if (expiresDate <= new Date()) {
        logger.warn("[Apple purchase] Transaction already expired", {
            originalTransactionId: payload.originalTransactionId,
            expiresDate,
            userId: user.id,
        });
        throw new ForbiddenError("Transaction already expired");
    }

    // Reject if this subscription is already claimed by a different user.
    // Uses originalTransactionId so every renewal of the same subscription
    // is anchored to the same record. This check MUST precede updateUserFromId
    // so we never grant Pro before verifying ownership.
    const existing = await TransactionService.findUserByTransactionId(payload.originalTransactionId);
    if (existing && existing.userId !== user.id) {
        logger.warn("[Apple purchase] Subscription already claimed by another user", {
            originalTransactionId: payload.originalTransactionId,
            claimingUserId: user.id,
            existingUserId: existing.userId,
        });
        throw new ForbiddenError("Subscription is already linked to a different account");
    }

    await TransactionService.createTransactionIfNotExists(user.id, "APPLE", payload.originalTransactionId);

    await UserService.updateUserFromId(user.id, {
        isProUntil: expiresDate,
        subscriptionProvider: "APPLE",
        isSubscriptionCancelled: false,
    });

    logger.debug("[Apple purchase] Pro granted", {
        userId: user.id,
        originalTransactionId: payload.originalTransactionId,
        expiresDate,
    });

    return Success(null);
}

export const POST = apiHandler(handleApplePurchase);
