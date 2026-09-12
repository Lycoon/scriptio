import { NextRequest } from "next/server";
import Stripe from "stripe";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { ForbiddenError, Success } from "@src/lib/utils/api-utils";
import * as UserService from "@src/server/service/user-service";

async function cancelSubscription(req: NextRequest, { user }: AuthApiContext) {
    const { stripeSubscriptionId } = await UserService.getStripeIds(user.id);
    if (!stripeSubscriptionId) throw new ForbiddenError("No active subscription found");

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });
    await UserService.updateUserFromId(user.id, { isSubscriptionCancelled: true });

    return Success(null);
}

export const POST = apiHandler(cancelSubscription);
