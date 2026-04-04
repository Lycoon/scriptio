import { NextRequest } from "next/server";
import Stripe from "stripe";
import { getCookieUser } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";
import { ForbiddenError, Success, UnauthorizedError } from "@src/lib/utils/api-utils";
import * as UserService from "@src/server/service/user-service";

async function cancelSubscription(req: NextRequest) {
    const cookie = await getCookieUser();
    if (!cookie?.id) throw new UnauthorizedError();

    const subscriptionId = await UserService.getSubscriptionId(cookie.id);
    if (!subscriptionId) throw new ForbiddenError("No active subscription found");

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    await UserService.updateUserFromId(cookie.id, { isSubscriptionCancelled: true });

    return Success(null);
}

export const POST = apiHandler(cancelSubscription);
