import { NextRequest } from "next/server";
import { decodeJwt } from "jose";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { BodyFieldError, ForbiddenError, Success } from "@src/lib/utils/api-utils";
import * as UserService from "@src/server/service/user-service";
import * as TransactionService from "@src/server/service/transaction-service";

const APPLE_PRODUCT_ID = "app.scriptio.pro.monthly";
const APPLE_BUNDLE_IDS = ["app.scriptio", "app.scriptio.staging"];

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

async function verifyApplePurchase(req: NextRequest, { user }: AuthApiContext) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const jwsTransaction = body.jwsTransaction;
    if (typeof jwsTransaction !== "string") {
        throw new BodyFieldError("Missing jwsTransaction");
    }

    const payload = decodeJwt(jwsTransaction) as unknown as AppleTransactionPayload;

    if (!APPLE_BUNDLE_IDS.includes(payload.bundleId)) {
        throw new ForbiddenError("Invalid bundle ID");
    }
    if (payload.productId !== APPLE_PRODUCT_ID) {
        throw new ForbiddenError("Invalid product ID");
    }
    if (payload.appAccountToken && payload.appAccountToken !== user.id) {
        throw new ForbiddenError("This purchase belongs to a different account");
    }

    const expiresDate = new Date(payload.expiresDate);
    if (expiresDate <= new Date()) {
        throw new ForbiddenError("Transaction already expired");
    }

    await UserService.updateUserFromId(user.id, {
        isProUntil: expiresDate,
        subscriptionProvider: "APPLE",
        isSubscriptionCancelled: false,
    });

    await TransactionService.createTransactionIfNotExists(user.id, "APPLE", payload.transactionId);

    return Success(null);
}

export const POST = apiHandler(verifyApplePurchase);
