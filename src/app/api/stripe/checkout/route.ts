import { NextRequest } from "next/server";
import Stripe from "stripe";
import { getCookieUser } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";
import { Success, UnauthorizedError } from "@src/lib/utils/api-utils";

async function createCheckoutSession(req: NextRequest) {
    const cookie = await getCookieUser();
    if (!cookie?.id) throw new UnauthorizedError();

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const baseUrl = (typeof body.redirectBase === "string" && body.redirectBase)
        ? body.redirectBase
        : (process.env.NEXT_PUBLIC_API_URL ?? "");

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
        client_reference_id: cookie.id,
        success_url: `${baseUrl}/?pro=success`,
        cancel_url: `${baseUrl}/?pro=cancel`,
    });

    return Success({ url: session.url });
}

export const POST = apiHandler(createCheckoutSession);
