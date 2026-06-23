import { NextRequest, NextResponse } from "next/server";
import { decodeJwt } from "jose";
import * as UserService from "@src/server/service/user-service";

const APPLE_PRODUCT_ID = "app.scriptio.pro.monthly";
const APPLE_BUNDLE_IDS = ["app.scriptio", "app.scriptio.staging"];

interface AppleTransactionPayload {
    bundleId: string;
    productId: string;
    appAccountToken?: string;
}

function maskEmail(email: string): string {
    const [local, domain] = email.split("@");
    return `${local[0]}***@${domain}`;
}

export async function POST(req: NextRequest) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const jwsTransaction = body.jwsTransaction;

    if (typeof jwsTransaction !== "string") {
        return NextResponse.json({ email: null });
    }

    const payload = decodeJwt(jwsTransaction) as unknown as AppleTransactionPayload;

    if (!APPLE_BUNDLE_IDS.includes(payload.bundleId) || payload.productId !== APPLE_PRODUCT_ID) {
        return NextResponse.json({ email: null });
    }

    if (!payload.appAccountToken) {
        return NextResponse.json({ email: null });
    }

    const user = await UserService.getUserFromId(payload.appAccountToken);
    const email = user?.email ? maskEmail(user.email) : null;

    return NextResponse.json({ email });
}
