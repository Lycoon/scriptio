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

// Transfers an existing Apple subscription from a previously-linked Scriptio
// account to the calling user. Unlike /api/apple/purchase, this endpoint
// intentionally tolerates an appAccountToken / existing-owner mismatch — that
// mismatch is the precondition for needing a transfer in the first place.
async function handleTransferSubscription(req: NextRequest, { user }: AuthApiContext) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const jwsTransaction = body.jwsTransaction;
    if (typeof jwsTransaction !== "string") {
        throw new BodyFieldError("Missing jwsTransaction");
    }

    logger.debug("[Apple transfer] Verifying JWS", { userId: user.id });

    const payload = await verifyAppleJws<AppleTransactionPayload>(jwsTransaction);

    if (!APPLE_BUNDLE_IDS.includes(payload.bundleId)) {
        logger.warn("[Apple transfer] Invalid bundle ID", { bundleId: payload.bundleId, userId: user.id });
        throw new ForbiddenError("Invalid bundle ID");
    }
    if (payload.productId !== APPLE_PRODUCT_ID) {
        logger.warn("[Apple transfer] Invalid product ID", { productId: payload.productId, userId: user.id });
        throw new ForbiddenError("Invalid product ID");
    }

    const expiresDate = new Date(payload.expiresDate);
    if (expiresDate <= new Date()) {
        logger.warn("[Apple transfer] Transaction already expired", {
            originalTransactionId: payload.originalTransactionId,
            expiresDate,
            userId: user.id,
        });
        throw new ForbiddenError("Transaction already expired");
    }

    const existing = await TransactionService.findUserByTransactionId(payload.originalTransactionId);
    const previousUserId = existing && existing.userId !== user.id ? existing.userId : null;

    if (previousUserId) {
        // Revoke Pro from the previously-linked account before re-binding the
        // transaction. Apple keeps billing the same Apple ID — only which
        // Scriptio account benefits is changing.
        logger.info("[Apple transfer] Revoking Pro from previous user", {
            previousUserId,
            newUserId: user.id,
            originalTransactionId: payload.originalTransactionId,
        });
        await UserService.updateUserFromId(previousUserId, {
            isProUntil: null,
            subscriptionProvider: null,
            isSubscriptionCancelled: false,
        });
        await TransactionService.reassignTransactionToUser(payload.originalTransactionId, user.id);
    } else if (!existing) {
        await TransactionService.createTransactionIfNotExists(user.id, "APPLE", payload.originalTransactionId);
    }

    await UserService.updateUserFromId(user.id, {
        isProUntil: expiresDate,
        subscriptionProvider: "APPLE",
        isSubscriptionCancelled: false,
    });

    logger.info("[Apple transfer] Subscription transferred", {
        newUserId: user.id,
        previousUserId,
        originalTransactionId: payload.originalTransactionId,
        expiresDate,
    });

    return Success(null);
}

export const POST = apiHandler(handleTransferSubscription);
